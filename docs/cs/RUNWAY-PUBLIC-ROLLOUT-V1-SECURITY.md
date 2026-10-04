# Bezpečnostní poznámka Runway Public Rollout V1

Rollout vrstva nepřidává nový request handler, autentizační plochu, secret, zápis environmentu, filesystem write, databázový zápis ani síťové volání. Jde o čistou in-process decision funkci nad již dostupným typovaným stavem.
