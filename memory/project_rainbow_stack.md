---
name: project-rainbow-stack
description: Stack técnica do Rainbow e porquê (Three.js + Vite + TS, mapa OSM estilizado)
metadata:
  type: project
---

Three.js + Vite + TypeScript, dev na porta 1234. Mapa a partir de dados OpenStreetMap em estilo cartoon/low-poly.
Voz das perguntas via Web Speech API (pt-PT). Progresso em localStorage, sem backend.

**Why:** escolhido pelo Telmo a 2026-11-11 entre Three.js / Babylon.js / Godot e entre OSM estilizado / Google 3D Tiles /
cidades inventadas. OSM dá ruas reais (morada de início faz sentido) com controlo total de colisões e objetos
interativos, sem custos; Google 3D Tiles foi rejeitado (faturação, malha sem colisões, pesado em tablet).

**How to apply:** não propor backend nem serviços pagos sem perguntar; qualquer fonte de tiles/geocoding tem de
respeitar as políticas de uso do OSM (ex.: Nominatim tem limites — usar com cache ou alternativa). Ver [[project-rainbow-origins]].
