# Auditovatelnost Runway Public Rollout V1

Version konstanta, explicitní názvy stavů, zachované readiness blockery a absence vedlejších efektů umožňují každé rollout rozhodnutí reprodukovat ze vstupů. V1 záměrně nepoužívá skryté timery, mutable countery ani persistence, které by mohly provozní stav odchýlit od readiness reportu.
