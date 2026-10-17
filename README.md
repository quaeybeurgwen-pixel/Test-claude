# Gwennou App

Application personnelle d'organisation pour iPhone : une page d'accueil qui résume la journée,
et quatre espaces thématiques.

| Écran | Contenu |
|---|---|
| **Accueil** | Tâches du jour (à cocher), rendez-vous Google Agenda, séance de sport du jour, citation du jour, tâches de la semaine |
| **Perso** | Tâches (priorité, échéance, rappel), agenda Google avec la couleur de chaque calendrier, habitudes (sommeil, pas, détente), courses, anniversaires |
| **ISP** | Vue d'ensemble par formation (Greffier, DSGJ, Cadre greffier) ; pour chacune : actions (dont les appels d'élèves), échéances (concours, webinaires, envois de documents…) avec actions datées générées automatiquement, polycopiés |
| **Sport** | Planning hebdomadaire (course à pied, crossfit…), séances répétées, compte à rebours marathon, kilomètres par semaine ; séances copiées dans l'agenda perso et dans Google Agenda |
| **Finances** | Dépenses et revenus du mois par catégorie, budgets, charges fixes ajoutées chaque mois, épargne (Livret A, LDDS, assurance vie, PER) |

Les rappels des tâches sont envoyés sous forme d'événements avec notification dans un agenda Google dédié.
Les tâches peuvent aussi se synchroniser avec **Microsoft To Do** (facultatif).

**Installation et connexions : voir [GUIDE.md](GUIDE.md).**

## Technique

- Application web installable (PWA), HTML/CSS/JavaScript sans dépendance ni étape de compilation.
- Données stockées sur l'appareil (`localStorage`), export/import JSON depuis les Réglages.
- Google Agenda : OAuth jeton implicite ; lecture des agendas, écriture limitée à l'agenda « Gwennou App — Rappels » (`calendar.app.created`). Microsoft To Do : OAuth code + PKCE via Microsoft Graph.
- Thème clair/sombre automatique, fonctionne hors connexion (service worker).

Pour l'essayer en local : `npx http-server .` puis ouvrir `http://localhost:8080`.
