# Gwennou App

Application personnelle d'organisation pour iPhone : une page d'accueil qui résume la journée,
et quatre espaces thématiques.

| Écran | Contenu |
|---|---|
| **Accueil** | Tâches du jour (à cocher), rendez-vous Google Agenda, séance de sport du jour, citation du jour, tâches de la semaine |
| **Perso** | Tâches (priorité, échéance, rappel), agenda Google avec la couleur de chaque calendrier, habitudes (sommeil, pas, détente), courses, anniversaires |
| **ISP** | Actions, échéances (concours, concours blancs, inscriptions…) avec actions datées générées automatiquement, suivi des polycopiés, suivi des élèves |
| **Sport** | Planning hebdomadaire (course à pied, crossfit…), séances répétées, compte à rebours marathon, kilomètres par semaine |
| **Finances** | Dépenses et revenus du mois par catégorie, budgets, charges fixes ajoutées chaque mois, épargne (Livret A, LDDS, assurance vie, PER) |

Les tâches se synchronisent avec **Microsoft To Do** (qui envoie les rappels sur l'iPhone).

**Installation et connexions : voir [GUIDE.md](GUIDE.md).**

## Technique

- Application web installable (PWA), HTML/CSS/JavaScript sans dépendance ni étape de compilation.
- Données stockées sur l'appareil (`localStorage`), export/import JSON depuis les Réglages.
- Google Agenda : OAuth jeton implicite, lecture seule. Microsoft To Do : OAuth code + PKCE via Microsoft Graph.
- Thème clair/sombre automatique, fonctionne hors connexion (service worker).

Pour l'essayer en local : `npx http-server .` puis ouvrir `http://localhost:8080`.
