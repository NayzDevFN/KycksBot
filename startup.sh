#!/bin/bash
# ===================== ACLCLOUDS STARTUP =====================
# Script de démarrage pour ACLClouds
# Ce fichier est exécuté automatiquement par le panel

# Installer les dépendances si node_modules n'existe pas
if [ ! -d "node_modules" ]; then
    echo "📦 Installation des dépendances..."
    npm install --production
fi

# Lancer le bot
echo "🤖 Démarrage de Kycks Bot..."
exec node api.js
