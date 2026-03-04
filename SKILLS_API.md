# API de Skills - Bolsa Laboral

Documentación de endpoints para gestión de skills de candidatos.

## Base URL

- Local: `http://localhost:3001`
- Producción: `https://api-leaduni.up.railway.app`

## Autenticación

Los endpoints protegidos requieren JWT en header:

`Authorization: Bearer <token>`

---

## 1) Buscar skills por nombre

**GET** `/api/skills/search?q=python&limit=10`

### Query params

- `q` (requerido): texto a buscar
- `limit` (opcional): cantidad de resultados (`default=10`, `max=50`)

### Response 200

```json
{
  "items": [
    { "id": 1, "name": "Python" },
    { "id": 12, "name": "Python Avanzado" }
  ]
}
```

### Error 400

```json
{
  "error": "Query param q is required"
}
```

---

## 2) Crear skill personalizada

**POST** `/api/skills`

**Auth:** Sí

### Body

```json
{
  "name": "NestJS"
}
```

### Response 201 (creada)

```json
{
  "ok": true,
  "created": true,
  "skill": { "id": 35, "name": "NestJS" }
}
```

### Response 200 (ya existía)

```json
{
  "ok": true,
  "created": false,
  "skill": { "id": 35, "name": "NestJS" }
}
```

---

## 3) Ver mis skills (candidato autenticado)

**GET** `/api/me/candidate/skills`

**Auth:** Sí

### Body

No requiere body.

### Response 200

```json
{
  "items": [
    { "id": 1, "name": "Python" },
    { "id": 2, "name": "SQL" }
  ]
}
```

---

## 4) Ver skills por candidateId

**GET** `/api/candidates/:candidateId/skills`

### Params

- `candidateId` (path, requerido, entero positivo)

### Body

No requiere body.

### Response 200

```json
{
  "items": [
    { "id": 3, "name": "JavaScript" },
    { "id": 8, "name": "React" }
  ]
}
```

### Error 400

```json
{
  "error": "Invalid candidateId"
}
```

---

## 5) Adjuntar skills al candidato autenticado

**POST** `/api/me/candidate/skills`

**Auth:** Sí

### Body (puedes mandar uno o ambos)

```json
{
  "skillIds": [1, 2, 10],
  "skillNames": ["TypeScript", "Node.js"]
}
```

### Reglas

- Si `skillNames` no existen, se crean automáticamente.
- Si ya están vinculadas al candidato, no se duplican.
- Si algún `skillId` no existe, devuelve error `400`.

### Response 201

```json
{
  "ok": true,
  "message": "Skills attached successfully",
  "items": [
    { "id": 1, "name": "Python" },
    { "id": 2, "name": "SQL" },
    { "id": 44, "name": "TypeScript" }
  ]
}
```

### Error 400 (ids inexistentes)

```json
{
  "error": "Some skillIds do not exist",
  "missingSkillIds": [999, 1000]
}
```

---

## 6) Quitar una skill del candidato autenticado

**DELETE** `/api/me/candidate/skills/:skillId`

**Auth:** Sí

### Params

- `skillId` (path, requerido, entero positivo)

### Body

No requiere body.

### Response 200

```json
{
  "ok": true,
  "message": "Skill removed successfully",
  "items": [
    { "id": 1, "name": "Python" },
    { "id": 2, "name": "SQL" }
  ]
}
```

### Error 404

```json
{
  "error": "Skill not attached to candidate"
}
```

---

## Códigos de estado comunes

- `200`: OK
- `201`: Creado
- `400`: Request inválido
- `401`: No autenticado
- `403`: Token inválido
- `404`: No encontrado
- `500`: Error interno

---

## Tablas esperadas

- `skills (id, name, ...)`
- `candidates_skills (candidate_id, skill_id)`
- `candidates (id, user_id, ...)`
