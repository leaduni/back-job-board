
### Paso 6: Actualizar Perfil de Candidato
Permite modificar los datos del perfil del candidato asociado al usuario actual.

- **URL:** `/api/me/candidate`
- **Método:** `PATCH`
- **Headers:** `Authorization: Bearer <token>`
- **Body (JSON):** (Envía solo los campos que quieras actualizar)
  ```json
  {
    "phone": "+51 999 999 999",
    "bio": "Nueva biografía actualizada...",
    "linkedin_url": "https://linkedin.com/in/nuevo-perfil",
    "major_id": 5
  }
  ```
- **Campos permitidos:** `first_name`, `last_name`, `phone`, `birth_date`, `location`, `major_id`, `start_year`, `end_year`, `bio`, `linkedin_url`, `github_url`, `portfolio_url`.

- **Respuesta Exitosa (200 OK):**
  ```json
  {
    "id": 10,
    "user_id": 1,
    "first_name": "Juan",
    "phone": "+51 999 999 999",
    // ... resto de campos actualizados
  }
  ```

**Ejemplo de uso:**

```javascript
async function updateProfile(updates) {
  const token = localStorage.getItem('authToken');
  
  const response = await fetch('http://localhost:3002/api/me/candidate', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(updates)
  });

  if (response.ok) {
    const updatedCandidate = await response.json();
    console.log('Perfil actualizado:', updatedCandidate);
  }
}
```
