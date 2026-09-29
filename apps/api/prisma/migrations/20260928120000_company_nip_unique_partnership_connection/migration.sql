-- Zadanie: "Partnerzy B2B — połączenie z istniejącą firmą" (wyszukiwanie po NIP).
-- Wyłącznie addytywne — brak DROP/DELETE/UPDATE, żadna istniejąca wartość nie jest dotykana.

-- Company.nip unikalny GLOBALNIE (w odróżnieniu od Contractor.nip, unikalnego
-- per-firma) — NIP identyfikuje jeden realny podmiot gospodarczy, a wyszukiwanie
-- partnera B2B po NIP (PartnershipsService.searchCompanyByNip) musi jednoznacznie
-- trafiać w co najwyżej jedną firmę. Częściowy indeks (WHERE "nip" IS NOT NULL) —
-- ten sam wzorzec co "User_companyId_login_key" (migracja
-- 20260926205659_product_manufacturer_optional_user_login) — wiele firm bez NIP-u
-- (NULL) nie koliduje ze sobą.
--
-- Sprawdzone PRZED dodaniem tego indeksu (lokalna baza dev, 2026-09-28):
--   SELECT nip, COUNT(*) FROM "Company" WHERE nip IS NOT NULL GROUP BY nip HAVING COUNT(*) > 1;
-- Wynik: 0 wierszy (brak kolizji). Przed wdrożeniem na innej bazie (produkcja)
-- należy powtórzyć to samo zapytanie — jeśli pojawią się duplikaty, migracja
-- nie powinna być stosowana bez wcześniejszego, ręcznego rozwiązania kolizji
-- (poza zakresem tej migracji — nic tu nie modyfikuje istniejących wartości).
CREATE UNIQUE INDEX "Company_nip_key" ON "Company"("nip") WHERE "nip" IS NOT NULL;
