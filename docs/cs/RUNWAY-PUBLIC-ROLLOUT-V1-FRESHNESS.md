# Freshness boundary Runway Public Rollout V1

Rollout stav nemá vlastní prediction freshness window. Existující 45sekundový freshness guard Runway Advisory zůstává odpovědný za potlačení stale konkrétní predikce i tehdy, když by rollout stav jinak byl `PUBLIC_ACTIVE`.
