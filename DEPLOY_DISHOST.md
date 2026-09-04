# Guide de deploiement - ACLClouds

## Etape 1 : Creer un compte sur ACLClouds

1. Va sur https://aclclouds.com
2. Clique sur "Heberger mon bot" ou "Bots Discord"
3. Cree un compte (pseudo + email, pas de carte bancaire)
4. Selectionne le plan **Bot Gratuit** (Node.js, 315 MB RAM, 715 MB SSD)

## Etape 2 : Uploader le bot

### Option A : Import Git (recommande)
1. Connecte-toi au panel ACLClouds
2. Clique sur "Create Service" -> choisis "Node.js"
3. Selectionne "Import from GitHub" ou entre l'URL de ton depot Git
4. Le panel importe automatiquement tous les fichiers

### Option B : Upload via le panel
1. Va dans "Files" (Gestionnaire de fichiers)
2. Upload TOUS les fichiers du dossier du bot :
   - `bot.js`
   - `api.js`
   - `package.json`
   - `package-lock.json`
   - `bot-config.json`
   - `startup.sh`
   - `index.html`
   - `panel.html`
   - `style.css`
   - `DEPLOY_DISHOST.md`
   - Dossier `assets/`
   - Dossier `backups/` (si tu en as)
   - `.env` (si tu l'utilises)
   - `.env.example`

### Option C : SFTP (FileZilla, WinSCP, etc.)
1. Recupere les identifiants SFTP dans ton panel ACLClouds
2. Connecte-toi avec un client SFTP
3. Upload tous les fichiers dans le repertoire du service
4. Lance `npm install` dans la console du panel

## Etape 3 : Installer les dependances

Dans la console du panel ACLClouds, lance :
```bash
npm install
```
Attends que l'installation se termine (tous les packages dans node_modules).

## Etape 4 : Configurer les variables d'environnement

Dans le panel, va dans "Startup" ou "Environment Variables" :

| Variable | Valeur |
|----------|--------|
| `DISCORD_TOKEN` | Ton token de bot Discord |
| `CLIENT_ID` | `1544851212187340881` |
| `GUILD_ID` | Ton ID de serveur (optionnel, pour dev rapide) |
| `PORT` | `3000` |

**IMPORTANT** : Ne mets JAMAIS le token directement dans le code. Utilise les variables privees du panel ACLClouds. Elles sont chiffrees et cachees.

## Etape 5 : Configurer le startup

Dans le panel, va dans "Startup" :
- **Startup Command** : `npm start`
- **Node.js Version** : 20 (ou 21)

## Etape 6 : Demarrer le bot

1. Va dans "Console" dans le panel
2. Clique sur "Start" ou lance `npm start`
3. Tu dois voir dans les logs :
   ```
   🌐 Serveur en ligne sur le port 3000
   🤖 Bot Discord connecté !
   📊 ACLClouds - Kycks Bot prêt
   🤖 KycksBot#xxxx est en ligne !
   ```

## Renouvellement (plan gratuit)

Le plan gratuit ACLClouds doit etre renouvelle tous les **4 jours** :
1. Connecte-toi au panel ACLClouds
2. Va dans "Services" ou "Mes services"
3. Clique sur "Renew" ou "Renouveler"
4. C'est fait ! Ton bot continue de tourner

## Modifier le bot apres hebergement

### Via le panel ACLClouds :
1. Va dans "Files" dans ton panel
2. Clique sur un fichier pour l'editer directement en ligne
3. Sauvegarde, puis redemarre le bot

### Via SFTP :
1. Connecte-toi en SFTP
2. Modifie les fichiers avec ton editeur
3. Redemarre le bot dans le panel

### Via le panel web du bot :
1. Le bot a un panel web accessible sur le port assigne
2. Tu peux modifier la configuration depuis le navigateur
3. Les changements sont appliques en temps reel

## Fichiers de donnees persistants

Ces fichiers sont sauvegardes sur le serveur et persistent apres restart :
- `bot-config.json` - Configuration du bot
- `xp-data.json` - Donnees XP/niveaux
- `warns-data.json` - Donnees d'avertissements
- `tickets-data.json` - Donnees des tickets
- `backups/` - Sauvegardes du serveur
- `settings.json` - Settings du panel web

## En cas de probleme

1. **Le bot ne demarre pas** : Verifie les logs dans la console du panel
2. **Token invalide** : Regenere le token dans Discord Developer Portal
3. **Erreurs npm** : Relance `npm install` dans la console
4. **Memoire insuffisante** : Passe a un plan payant (des 2,99 EUR/mois)
5. **Bot hors ligne** : Verifie que le renouvellement est a jour (tous les 4 jours)

## Commandes utiles dans la console

```bash
# Installer les dependances
npm install

# Demarrer le bot
npm start

# Voir les fichiers
ls -la

# Voir l'utilisation memoire
free -m
```
