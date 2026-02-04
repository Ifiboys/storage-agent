# 🔐 EnvSafe Storage Agent

Agent de stockage pour EnvSafe BYOS (Bring Your Own Storage) - Hébergez vos secrets chiffrés sur votre propre infrastructure.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

---

## 📖 Table des Matières

- [Qu'est-ce que c'est ?](#quest-ce-que-cest-)
- [Sécurité](#-sécurité-importante)
- [Prérequis](#-prérequis)
- [Installation Rapide](#-installation-rapide-docker)
- [Déploiement en Production](#-déploiement-en-production)
- [Configuration](#️-configuration)
- [API Endpoints](#-api-endpoints)
- [Monitoring](#-monitoring)
- [Troubleshooting](#-troubleshooting)

---

## Qu'est-ce que c'est ?

L'**EnvSafe Storage Agent** vous permet de stocker vos secrets chiffrés sur **votre propre serveur** au lieu du cloud EnvSafe, tout en continuant à utiliser l'interface EnvSafe et la CLI.

### Cas d'usage

- ✅ Conformité réglementaire (RGPD, HDS, HIPAA...)
- ✅ Souveraineté des données
- ✅ Exigences de localisation des données
- ✅ Contrôle total de l'infrastructure

---

## ⚠️ Sécurité (IMPORTANT)

### Ce que cet agent NE PEUT PAS faire

❌ **Il ne peut PAS lire vos secrets**  
❌ **Il ne stocke PAS de secrets en clair**  
❌ **Il n'a PAS accès à vos clés de déchiffrement**

### Ce qu'il fait

✅ **Il stocke des blobs chiffrés** (texte illisible en AES-256-GCM)  
✅ **Il vérifie l'authentification HMAC** des requêtes  
✅ **Il refuse les requêtes non autorisées**

**Même avec un accès complet à la base de données, vos secrets restent illisibles.**  
Seule votre clé privée locale (CLI/Navigateur) peut déchiffrer les données.

---

## 📋 Prérequis

- **Docker** et **Docker Compose** (recommandé)
- OU **Node.js 18+** et **PostgreSQL 15+**
- Un serveur (VPS, cloud, on-premise...)
- Un nom de domaine avec certificat SSL (HTTPS obligatoire en production)

---

## 🚀 Installation Rapide (Docker)

### Étape 1 : Cloner le dépôt

```bash
git clone https://github.com/Ifiboys/storage-agent.git
cd storage-agent
```

### Étape 2 : Générer un secret sécurisé

```bash
openssl rand -hex 32
```

Copiez le résultat (ex: `a1b2c3d4e5f6...xyz`)

### Étape 3 : Créer le fichier `.env`

```bash
cp .env.example .env
nano .env
```

Modifiez les valeurs :

```env
AUTH_SECRET=<votre-secret-genere-a-l-etape-2>
POSTGRES_USER=envsafe
POSTGRES_PASSWORD=<mot-de-passe-securise>
POSTGRES_DB=envsafe_storage
PORT=3001
```

### Étape 4 : Lancer l'agent

```bash
docker-compose up -d
```

### Étape 5 : Vérifier que l'agent fonctionne

```bash
docker-compose logs -f agent
```

Vous devriez voir :

```
🔐 EnvSafe Storage Agent v1.0.0
Status: Running on port 3001
```

---

## 🌐 Déploiement en Production

### Option 1 : VPS (DigitalOcean, Hetzner, OVH...)

#### 1. Configurer le serveur

```bash
# Connexion SSH
ssh root@votre-serveur.com

# Installer Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Installer Docker Compose
sudo apt update
sudo apt install docker-compose-plugin
```

#### 2. Cloner et configurer

```bash
git clone https://github.com/Ifiboys/storage-agent.git
cd storage-agent

# Générer le secret
openssl rand -hex 32

# Configurer .env
cp .env.example .env
nano .env
```

#### 3. Configurer Nginx avec SSL

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

Créez `/etc/nginx/sites-available/envsafe-agent` :

```nginx
server {
    listen 80;
    server_name envsafe-storage.votre-domaine.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Activez le site et obtenez un certificat SSL :

```bash
sudo ln -s /etc/nginx/sites-available/envsafe-agent /etc/nginx/sites-enabled/
sudo certbot --nginx -d envsafe-storage.votre-domaine.com
sudo systemctl reload nginx
```

#### 4. Lancer l'agent

```bash
docker-compose up -d
```

#### 5. Configurer le démarrage automatique

```bash
# Créer un service systemd
sudo nano /etc/systemd/system/envsafe-agent.service
```

Contenu :

```ini
[Unit]
Description=EnvSafe Storage Agent
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/root/envsafe-storage-agent
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Activez le service :

```bash
sudo systemctl enable envsafe-agent
sudo systemctl start envsafe-agent
```

---

### Option 2 : Cloud (AWS, GCP, Azure...)

#### AWS ECS (Fargate)

1. **Build et push l'image Docker** :

```bash
# Créer un ECR repository
aws ecr create-repository --repository-name envsafe-agent

# Login
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build et push
docker build -t envsafe-agent .
docker tag envsafe-agent:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/envsafe-agent:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/envsafe-agent:latest
```

2. **Créer une task definition** avec les variables d'environnement
3. **Lancer un service Fargate** avec un Load Balancer HTTPS

#### Google Cloud Run

```bash
# Build
gcloud builds submit --tag gcr.io/PROJECT-ID/envsafe-agent

# Deploy
gcloud run deploy envsafe-agent \
  --image gcr.io/PROJECT-ID/envsafe-agent \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars AUTH_SECRET=<secret>,DATABASE_URL=<db-url>
```

---

### Option 3 : Kubernetes (K8s)

Créez `k8s-deployment.yaml` :

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: envsafe-agent
spec:
  replicas: 2
  selector:
    matchLabels:
      app: envsafe-agent
  template:
    metadata:
      labels:
        app: envsafe-agent
    spec:
      containers:
      - name: agent
        image: ghcr.io/ifiboys/envsafe-agent:latest
        ports:
        - containerPort: 3001
        env:
        - name: AUTH_SECRET
          valueFrom:
            secretKeyRef:
              name: envsafe-secrets
              key: auth-secret
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: envsafe-secrets
              key: database-url
---
apiVersion: v1
kind: Service
metadata:
  name: envsafe-agent-service
spec:
  selector:
    app: envsafe-agent
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3001
  type: LoadBalancer
```

Déployer :

```bash
kubectl create secret generic envsafe-secrets \
  --from-literal=auth-secret=<your-secret> \
  --from-literal=database-url=<your-db-url>

kubectl apply -f k8s-deployment.yaml
```

---

## ⚙️ Configuration

### Variables d'Environnement

| Variable | Requis | Description | Exemple |
|----------|--------|-------------|---------|
| `AUTH_SECRET` | ✅ Oui | Secret partagé HMAC (généré avec `openssl rand -hex 32`) | `a1b2c3d4e5f6...` |
| `DATABASE_URL` | ✅ Oui | URL de connexion PostgreSQL | `postgresql://user:pass@host:5432/db` |
| `PORT` | ❌ Non | Port d'écoute (défaut: 3001) | `3001` |
| `NODE_ENV` | ❌ Non | Environnement Node.js | `production` |

---

## 📡 API Endpoints

Tous les endpoints nécessitent une authentification HMAC.

### Headers requis

```
Authorization: Bearer <AUTH_SECRET>
X-EnvSafe-Timestamp: <timestamp-ms>
X-EnvSafe-Signature: <hmac-sha256>
```

### Endpoints

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/store-secret` | Stocker un secret chiffré |
| `GET` | `/get-secret` | Récupérer un secret chiffré |
| `GET` | `/get-all-secrets` | Récupérer tous les secrets d'un environnement |
| `DELETE` | `/delete-secret` | Supprimer un secret |

---

## 📊 Monitoring

### Logs

```bash
# Docker Compose
docker-compose logs -f agent

# Docker
docker logs -f <container-id>

# Kubernetes
kubectl logs -f deployment/envsafe-agent
```

### Health Check

```bash
# Teste la disponibilité de l'agent
curl https://envsafe-storage.votre-domaine.com/health \
  -H "Authorization: Bearer <AUTH_SECRET>" \
  -H "X-EnvSafe-Timestamp: $(date +%s)000" \
  -H "X-EnvSafe-Signature: <signature>"
```

### Prometheus Metrics (Optionnel)

Ajoutez `prom-client` pour exposer des métriques :

```bash
npm install prom-client
```

---

## 🔧 Troubleshooting

### L'agent ne démarre pas

1. Vérifiez les logs : `docker-compose logs agent`
2. Vérifiez que PostgreSQL est accessible
3. Vérifiez que `AUTH_SECRET` est défini dans `.env`

### Erreur "Invalid token"

- Le `AUTH_SECRET` configuré dans l'agent doit être identique à celui dans EnvSafe (SaaS)

### Erreur "Request expired"

- Vérifiez que l'horloge de votre serveur est synchronisée (NTP)

### Impossible de se connecter depuis EnvSafe

- Vérifiez que le port 3001 (ou votre port) est ouvert dans le firewall
- Vérifiez que Nginx/reverse proxy est correctement configuré
- Vérifiez que le certificat SSL est valide (HTTPS obligatoire)

---

## 📦 Base de Données

### Backups

```bash
# Backup PostgreSQL
docker-compose exec postgres pg_dump -U envsafe envsafe_storage > backup.sql

# Restore
docker-compose exec -T postgres psql -U envsafe envsafe_storage < backup.sql
```

### Migrations

Les migrations sont automatiquement exécutées au démarrage de l'agent.

Pour les exécuter manuellement :

```bash
docker-compose exec agent npx prisma migrate deploy
```

---

## 🤝 Support

- 📚 Documentation complète : [envsafe.vercel.app/docs/external-storage](https://www.envsafe.dev/docs/external-storage)
- 🐛 Issues : [github.com/Ifiboys/storage-agent/issues](https://github.com/Ifiboys/storage-agent/issues)
- 📧 Email : oladokunefi123@gmail.com

---

## 📄 Licence

MIT License - Voir [LICENSE](LICENSE)

---

**Créé avec ❤️ pour EnvSafe**
