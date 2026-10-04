# Rollback Runway Public Rollout V1

Pokud je nutné ručně nakonfigurovanou PUBLIC Runway capability stáhnout, nastaví se nakonfigurovaná Runway capability zpět na SHADOW. Runtime readiness už při ztrátě PASS automaticky fail-closed stáhne efektivní policy, takže rollback nevyžaduje mazání dat ani změnu prediction state.

Tento dokument produkční konfiguraci nemění; pouze zaznamenává zamýšlenou provozní recovery cestu.
