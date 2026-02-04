import express, { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { PrismaClient } from "./generated/client";

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

// ⚠️ IMPORTANT: Cet agent stocke UNIQUEMENT des données CHIFFRÉES
// Il ne peut PAS lire vos secrets

interface AuthenticatedRequest extends Request {
    authenticated?: boolean;
}

// Middleware d'authentification
const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const timestamp = req.headers["x-envsafe-timestamp"] as string;
    const signature = req.headers["x-envsafe-signature"] as string;

    if (!authHeader || !timestamp || !signature) {
        return res.status(401).json({ error: "Missing authentication headers" });
    }

    const token = authHeader.replace("Bearer ", "");
    const expectedSecret = process.env.AUTH_SECRET;

    if (!expectedSecret) {
        console.error("AUTH_SECRET not configured");
        return res.status(500).json({ error: "Server misconfiguration" });
    }

    // Vérifier le token
    if (token !== expectedSecret) {
        console.warn(`❌ Failed authentication attempt from ${req.ip}`);
        return res.status(401).json({ error: "Invalid token" });
    }

    // Vérifier la signature HMAC
    const expectedSignature = crypto
        .createHmac("sha256", expectedSecret)
        .update(timestamp)
        .digest("hex");

    if (signature !== expectedSignature) {
        console.warn(`❌ Invalid HMAC signature from ${req.ip}`);
        return res.status(401).json({ error: "Invalid signature" });
    }

    // Vérifier que le timestamp n'est pas trop ancien (5 minutes max)
    const now = Date.now();
    const requestTime = parseInt(timestamp);
    if (Math.abs(now - requestTime) > 5 * 60 * 1000) {
        return res.status(401).json({ error: "Request expired" });
    }

    req.authenticated = true;
    next();
};

// Health check (protégé par authentification)
app.get("/health", authenticate, (req: Request, res: Response) => {
    res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        mode: "encrypted-storage-only"
    });
});

// Stocker un secret chiffré
app.post("/store-secret", authenticate, async (req: Request, res: Response) => {
    const { key, encryptedValue, environmentId } = req.body;

    if (!key || !encryptedValue || !environmentId) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        // Note: encryptedValue est déjà chiffré par le client
        // L'agent ne fait que le stocker, il ne peut pas le lire
        await prisma.encryptedVariable.upsert({
            where: {
                environmentId_key: { environmentId, key }
            },
            create: { key, encryptedValue, environmentId },
            update: { encryptedValue }
        });

        console.log(`✅ Stored encrypted variable: ${key} for env: ${environmentId}`);
        res.json({ success: true });
    } catch (error) {
        console.error("❌ Error storing variable:", error);
        res.status(500).json({ error: "Failed to store variable" });
    }
});

// Récupérer un secret chiffré
app.get("/get-secret", authenticate, async (req: Request, res: Response) => {
    const { key, environmentId } = req.query;

    if (!key || !environmentId) {
        return res.status(400).json({ error: "Missing required parameters" });
    }

    try {
        const variable = await prisma.encryptedVariable.findUnique({
            where: {
                environmentId_key: {
                    environmentId: environmentId as string,
                    key: key as string
                }
            }
        });

        if (!variable) {
            return res.status(404).json({ error: "Variable not found" });
        }

        // Retourne la valeur chiffrée (toujours illisible)
        res.json({ encryptedValue: variable.encryptedValue });
    } catch (error) {
        console.error("❌ Error getting variable:", error);
        res.status(500).json({ error: "Failed to get variable" });
    }
});

// Récupérer tous les secrets d'un environnement
app.get("/get-all-secrets", authenticate, async (req: Request, res: Response) => {
    const { environmentId } = req.query;

    if (!environmentId) {
        return res.status(400).json({ error: "Missing environmentId" });
    }

    try {
        const variables = await prisma.encryptedVariable.findMany({
            where: {
                environmentId: environmentId as string
            }
        });

        res.json({
            variables: variables.map(v => ({
                key: v.key,
                encryptedValue: v.encryptedValue,
                environmentId: v.environmentId
            }))
        });
    } catch (error) {
        console.error("❌ Error getting all variables:", error);
        res.status(500).json({ error: "Failed to get variables" });
    }
});

// Supprimer un secret
app.delete("/delete-secret", authenticate, async (req: Request, res: Response) => {
    const { key, environmentId } = req.body;

    if (!key || !environmentId) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        await prisma.encryptedVariable.delete({
            where: {
                environmentId_key: { environmentId, key }
            }
        });

        console.log(`🗑️  Deleted encrypted variable: ${key} from env: ${environmentId}`);
        res.json({ success: true });
    } catch (error) {
        console.error("❌ Error deleting variable:", error);
        res.status(500).json({ error: "Failed to delete variable" });
    }
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🔐 EnvSafe Storage Agent v1.0.0                        ║
║                                                           ║
║   Status: Running on port ${PORT}                           ║
║   Mode: Encrypted Storage Only                           ║
║                                                           ║
║   ⚠️  SECURITY REMINDER:                                 ║
║   → This agent stores ENCRYPTED data only                ║
║   → Even with database access, secrets remain unreadable ║
║   → Only the client with the private key can decrypt     ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
    console.log("SIGTERM received, closing gracefully...");
    await prisma.$disconnect();
    process.exit(0);
});

process.on("SIGINT", async () => {
    console.log("\nSIGINT received, closing gracefully...");
    await prisma.$disconnect();
    process.exit(0);
});
