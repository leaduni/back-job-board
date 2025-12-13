// Simple Express app template (CommonJS-friendly)
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const { v2: cloudinary } = require('cloudinary')
require('dotenv').config()
const { listTables, ping } = require('./db')
const { pool } = require('./db')

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())

// Configure Cloudinary (requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Multer memory storage for multipart uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
})

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

// DB ping
app.get('/api/db/ping', async (req, res) => {
  try {
    const r = await ping()
    res.json({ status: 'ok', db: r })
  } catch (err) {
    console.error('DB ping error:', err)
    res.status(500).json({ error: 'DB ping failed', detail: err.message })
  }
})

// List DB tables
app.get('/api/db/tables', async (req, res) => {
  try {
    const tables = await listTables()
    res.json({ tables })
  } catch (err) {
    console.error('List tables error:', err)
    res.status(500).json({ error: 'Failed to list tables', detail: err.message })
  }
})

// Describe table columns and types
// Usage: GET /api/db/describe?table=perfiles&schema=public
app.get('/api/db/describe', async (req, res) => {
  const schema = req.query.schema || 'public'
  const table = req.query.table
  if (!table) return res.status(400).json({ error: 'Missing query param "table"' })
  try {
    const sql = `
      SELECT
        c.column_name,
        c.data_type,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.is_nullable,
        c.column_default
      FROM information_schema.columns c
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position
    `
    const { rows } = await pool.query(sql, [schema, table])
    res.json({ schema, table, columns: rows })
  } catch (err) {
    console.error('Describe table error:', err)
    res.status(500).json({ error: 'Failed to describe table', detail: err.message })
  }
})

// Upload CV to Cloudinary folder "CVs LEAD"
// - Multipart: field name "file" (PDF/DOC/DOCX etc.)
// - JSON: { fileUrl: 'https://...' } or data URI
app.post('/api/upload/cv', upload.single('file'), async (req, res) => {
  try {
    const folder = 'CVs LEAD'

    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder, resource_type: 'auto' },
          (error, uploadResult) => {
            if (error) return reject(error)
            resolve(uploadResult)
          }
        )
        stream.end(req.file.buffer)
      })
      return res.json({ ok: true, result })
    }

    const { fileUrl, publicId } = req.body || {}
    if (!fileUrl) {
      return res.status(400).json({ ok: false, error: 'Provide multipart field "file" or body.fileUrl' })
    }

    const result = await cloudinary.uploader.upload(fileUrl, {
      folder,
      public_id: publicId || undefined,
      resource_type: 'auto',
    })
    res.json({ ok: true, result })
  } catch (err) {
    console.error('Cloudinary upload error:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Seed endpoint: ejecuta los INSERTs de ejemplo en una transacción
app.post('/api/seed', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Perfiles
    await client.query(`
      INSERT INTO public.perfiles (user_id, user_email, nombres, apellidos, carrera, ciclo_actual)
      VALUES (1,'juan.perez@uni.edu.pe','Juan Carlos','Pérez López','Ingeniería de Sistemas',8);
    `)
    
    try {
    await client.query(`
      INSERT INTO public.perfiles (
        user_id, user_email, nombres, apellidos, telefono, fecha_nacimiento, carrera, ciclo_actual, anio_egreso,
        promedio_ponderado, departamento, provincia, distrito, linkedin_url, github_url, portfolio_url,
        cv_url, cv_filename, cv_uploaded_at, sobre_mi, habilidades_tecnicas, habilidades_blandas, intereses,
        experiencia_laboral, proyectos, idiomas, educacion_adicional, modalidad_preferida, disponibilidad,
        expectativa_salarial_min, expectativa_salarial_max, perfil_publico, busca_empleo, disponible_inmediato
      ) VALUES (
        2,'maria.garcia@uni.edu.pe','María','García Torres','+51 987654321','2001-05-15','Ingeniería Industrial',10,2024,9.80,
        'Lima','Lima','San Isidro','https://linkedin.com/in/mariagarcia','https://github.com/mariagarcia','https://mariagarcia.dev',
        'https://res.cloudinary.com/leaduni/raw/upload/v1234567890/leaduni/cvs/cv_2_1234567890.pdf','CV_Maria_Garcia.pdf', NOW(),
        'Estudiante de últimos ciclos apasionada por la optimización de procesos y el análisis de datos. Busco oportunidades para aplicar mis conocimientos en proyectos reales.',
        'Python, SQL, Power BI, Excel Avanzado, Minitab, Arena Simulation',
        'Liderazgo, Trabajo en equipo, Resolución de problemas, Comunicación efectiva',
        'Análisis de datos, Mejora continua, Lean Six Sigma, Supply Chain',
        '[{"empresa":"Alicorp S.A.","cargo":"Practicante de Mejora Continua","descripcion":"Implementación de metodología Lean en líneas de producción, reduciendo tiempos de cambio en 25%","fecha_inicio":"2023-03","fecha_fin":"2023-12","actualmente":false},{"empresa":"Backus","cargo":"Practicante de Planeamiento","descripcion":"Análisis de demanda y optimización de inventarios usando Python","fecha_inicio":"2024-01","fecha_fin":null,"actualmente":true}]'::jsonb,
        '[{"nombre":"Sistema de Gestión de Inventarios","descripcion":"Aplicación web para control de inventarios con alertas automáticas de stock bajo","url":"https://inventory-system.vercel.app","repositorio":"https://github.com/mariagarcia/inventory-system","tecnologias":"React, Node.js, PostgreSQL, Chart.js","fecha":"2024-02"},{"nombre":"Dashboard de Indicadores KPI","descripcion":"Dashboard interactivo para visualización de KPIs operacionales en tiempo real","url":null,"repositorio":"https://github.com/mariagarcia/kpi-dashboard","tecnologias":"Python, Dash, Plotly, Pandas","fecha":"2023-11"}]'::jsonb,
        '[{"idioma":"Español","nivel":"nativo","certificacion":null},{"idioma":"Inglés","nivel":"avanzado","certificacion":"TOEFL ITP 580"},{"idioma":"Portugués","nivel":"basico","certificacion":null}]'::jsonb,
        '[{"tipo":"certificacion","institucion":"Coursera - Google","titulo":"Google Data Analytics Professional Certificate","fecha":"2023-08"},{"tipo":"curso","institucion":"LinkedIn Learning","titulo":"Lean Six Sigma Yellow Belt","fecha":"2023-05"}]'::jsonb,
        'hibrido','Inmediata, 40 horas semanales',2000.00,2500.00,true,true,true
      );
    `)
    } catch (e) {
      throw new Error(`Seed perfiles (Maria) failed: ${e.message}`)
    }

    await client.query(`
      INSERT INTO public.perfiles (
        user_id, user_email, nombres, apellidos, telefono, carrera, anio_egreso, departamento, distrito, linkedin_url,
        github_url, cv_url, sobre_mi, habilidades_tecnicas, experiencia_laboral, proyectos, idiomas, modalidad_preferida,
        expectativa_salarial_min, busca_empleo, disponible_inmediato
      ) VALUES (
        3,'carlos.rodriguez@uni.edu.pe','Carlos','Rodríguez Mendoza','+51 912345678','Ingeniería Mecánica',2023,'Lima','Surco',
        'https://linkedin.com/in/carlosrodriguez','https://github.com/carlosr','https://res.cloudinary.com/leaduni/raw/upload/v1234567890/leaduni/cvs/cv_3_1234567890.pdf',
        'Ingeniero Mecánico con 1 año de experiencia en diseño y simulación. Especializado en SolidWorks y análisis FEA.',
        'SolidWorks, AutoCAD, ANSYS, MATLAB, Python',
        '[{"empresa":"Ferreyros S.A.","cargo":"Ingeniero de Diseño Junior","descripcion":"Diseño de componentes mecánicos y análisis de esfuerzos","fecha_inicio":"2023-02","fecha_fin":null,"actualmente":true}]'::jsonb,
        '[{"nombre":"Brazo Robótico de 6 GDL","descripcion":"Diseño y simulación de brazo robótico para aplicaciones industriales","url":null,"repositorio":null,"tecnologias":"SolidWorks, MATLAB, Arduino","fecha":"2022-12"}]'::jsonb,
        '[{"idioma":"Español","nivel":"nativo","certificacion":null},{"idioma":"Inglés","nivel":"intermedio","certificacion":null}]'::jsonb,
        'presencial',3000.00,false,false
      );
    `)

    // Postulaciones
    await client.query(`
      INSERT INTO public.postulaciones (
        oferta_id, oferta_titulo, oferta_slug, empresa_id, empresa_nombre, perfil_id, user_email, carta_presentacion, cv_url,
        estado, empresa_contacto_email, ip_address
      ) VALUES (
        101,'Practicante de Desarrollo Backend','practicante-desarrollo-backend',1,'TechCorp Perú',
        (SELECT id FROM public.perfiles WHERE user_id = 1),'juan.perez@uni.edu.pe',
        'Estimado equipo de TechCorp,\n\nMe dirijo a ustedes con gran entusiasmo para postular al puesto de Practicante de Desarrollo Backend...\n\nAtentamente,\nJuan Carlos Pérez',
        'https://res.cloudinary.com/leaduni/raw/upload/v1234567890/leaduni/cvs/cv_1_1234567890.pdf','enviada','rrhh@techcorp.com','192.168.1.100'
      );
    `)

    await client.query(`
      INSERT INTO public.postulaciones (
        oferta_id, oferta_titulo, oferta_slug, empresa_id, empresa_nombre, empresa_logo_url, perfil_id, user_email,
        carta_presentacion, cv_url, estado, notas_internas, historial_estados, email_enviado, fecha_email_enviado,
        empresa_contacto_email
      ) VALUES (
        102,'Analista de Mejora Continua','analista-mejora-continua',2,'Alicorp S.A.',
        'https://res.cloudinary.com/leaduni/image/upload/v1234567890/leaduni/logos/alicorp.png',
        (SELECT id FROM public.perfiles WHERE user_id = 2),'maria.garcia@uni.edu.pe',
        'Estimados,\n\nCon gran interés me postulo al puesto de Analista de Mejora Continua...',
        'https://res.cloudinary.com/leaduni/raw/upload/v1234567890/leaduni/cvs/cv_2_1234567890.pdf','en_revision',
        'Perfil muy interesante, experiencia previa en la empresa es un plus',
        '[{"estado":"enviada","fecha":"2024-01-15T10:30:00Z","nota":"Postulación recibida"},{"estado":"en_revision","fecha":"2024-01-16T14:20:00Z","nota":"Perfil muy interesante, experiencia previa en la empresa es un plus"}]'::jsonb,
        true,'2024-01-15 10:35:00','seleccion@alicorp.com.pe'
      );
    `)

    await client.query(`
      INSERT INTO public.postulaciones (
        oferta_id, oferta_titulo, oferta_slug, empresa_id, empresa_nombre, perfil_id, user_email, carta_presentacion, cv_url,
        respuestas_adicionales, estado, historial_estados, email_enviado, empresa_contacto_email
      ) VALUES (
        103,'Ingeniero de Diseño Mecánico Junior','ingeniero-diseno-mecanico-junior',3,'Ferreyros S.A.',
        (SELECT id FROM public.perfiles WHERE user_id = 3),'carlos.rodriguez@uni.edu.pe',
        'Estimado equipo de Ferreyros,\n\nMe complace postular al puesto de Ingeniero de Diseño Mecánico Junior...',
        'https://res.cloudinary.com/leaduni/raw/upload/v1234567890/leaduni/cvs/cv_3_1234567890.pdf',
        '[{"pregunta":"¿Cuántos años de experiencia tienes con SolidWorks?","respuesta":"Tengo 2 años..."},{"pregunta":"¿Estás disponible para trabajar en campo?","respuesta":"Sí, estoy completamente disponible..."}]'::jsonb,
        'entrevista_programada',
        '[{"estado":"enviada","fecha":"2024-01-10T09:00:00Z","nota":"Postulación recibida"},{"estado":"en_revision","fecha":"2024-01-11T11:00:00Z","nota":"Candidato con experiencia previa en la empresa"},{"estado":"entrevista_programada","fecha":"2024-01-12T16:00:00Z","nota":"Entrevista programada para el 20/01/2024 a las 10:00 AM"}]'::jsonb,
        true,'reclutamiento@ferreyros.com.pe'
      );
    `)

    await client.query(`
      INSERT INTO public.postulaciones (
        oferta_id, oferta_titulo, oferta_slug, empresa_id, empresa_nombre, perfil_id, user_email, carta_presentacion, cv_url,
        estado, notas_internas, historial_estados, email_enviado
      ) VALUES (
        104,'Desarrollador Full Stack Senior','desarrollador-fullstack-senior',4,'StartupTech',
        (SELECT id FROM public.perfiles WHERE user_id = 1),'juan.perez@uni.edu.pe',
        'Estimado equipo,\n\nMe interesa el puesto de Desarrollador Full Stack Senior...',
        'https://res.cloudinary.com/leaduni/raw/upload/v1234567890/leaduni/cvs/cv_1_1234567890.pdf','rechazada',
        'Perfil junior, el puesto requiere 3+ años de experiencia',
        '[{"estado":"enviada","fecha":"2024-01-08T14:00:00Z","nota":"Postulación recibida"},{"estado":"en_revision","fecha":"2024-01-09T10:00:00Z","nota":"Revisando perfil"},{"estado":"rechazada","fecha":"2024-01-09T15:00:00Z","nota":"Perfil junior, el puesto requiere 3+ años de experiencia"}]'::jsonb,
        true
      );
    `)

    // Notificaciones
    await client.query(`
      INSERT INTO public.notificaciones (
        perfil_id, user_email, tipo, titulo, mensaje, url, accion_principal, entidad_tipo, entidad_id, metadata, prioridad
      ) VALUES (
        (SELECT id FROM public.perfiles WHERE user_id = 1),'juan.perez@uni.edu.pe','postulacion_enviada','✅ Postulación enviada exitosamente',
        'Tu postulación a "Practicante de Desarrollo Backend" en TechCorp Perú ha sido enviada correctamente. Te notificaremos cuando haya novedades.',
        '/mis-postulaciones','Ver postulación','postulacion',101,'{"oferta_titulo":"Practicante de Desarrollo Backend","empresa":"TechCorp Perú"}'::jsonb,'normal'
      );
    `)

    await client.query(`
      INSERT INTO public.notificaciones (
        perfil_id, user_email, tipo, titulo, mensaje, url, accion_principal, entidad_tipo, entidad_id, metadata, prioridad, leida
      ) VALUES (
        (SELECT id FROM public.perfiles WHERE user_id = 2),'maria.garcia@uni.edu.pe','cambio_estado_postulacion','🎉 Tu postulación está en revisión',
        'Alicorp S.A. está revisando tu postulación para "Analista de Mejora Continua". ¡Mantente atento a tu correo!',
        '/mis-postulaciones','Ver detalles','postulacion',102,'{"oferta_titulo":"Analista de Mejora Continua","empresa":"Alicorp S.A.","estado_anterior":"enviada","estado_nuevo":"en_revision"}'::jsonb,
        'alta',false
      );
    `)

    await client.query(`
      INSERT INTO public.notificaciones (
        perfil_id, user_email, tipo, titulo, mensaje, url, accion_principal, accion_secundaria, entidad_tipo, entidad_id, metadata, prioridad
      ) VALUES (
        (SELECT id FROM public.perfiles WHERE user_id = 3),'carlos.rodriguez@uni.edu.pe','cambio_estado_postulacion','📅 ¡Entrevista programada!',
        'Ferreyros S.A. ha programado una entrevista contigo para el puesto de "Ingeniero de Diseño Mecánico Junior" el día 20/01/2024 a las 10:00 AM.',
        '/mis-postulaciones','Ver detalles','Agregar a calendario','postulacion',103,'{"oferta_titulo":"Ingeniero de Diseño Mecánico Junior","empresa":"Ferreyros S.A.","fecha_entrevista":"2024-01-20T10:00:00Z","modalidad":"presencial","direccion":"Av. Cristóbal de Peralta Norte 820, Surco"}'::jsonb,
        'urgente'
      );
    `)

    await client.query(`
      INSERT INTO public.notificaciones (
        perfil_id, user_email, tipo, titulo, mensaje, url, accion_principal, metadata, prioridad
      ) VALUES (
        (SELECT id FROM public.perfiles WHERE user_id = 1),'juan.perez@uni.edu.pe','perfil_incompleto','⚠️ Completa tu perfil',
        'Tu perfil está al 45%. Complétalo para tener más oportunidades de ser contactado por empresas. Agrega tu CV, experiencia y proyectos.',
        '/perfil/editar','Completar perfil','{"porcentaje_actual":45,"campos_faltantes":["cv_url","experiencia_laboral","proyectos"]}'::jsonb,'baja'
      );
    `)

    await client.query(`
      INSERT INTO public.notificaciones (
        perfil_id, user_email, tipo, titulo, mensaje, url, accion_principal, entidad_tipo, entidad_id, metadata, prioridad
      ) VALUES (
        (SELECT id FROM public.perfiles WHERE user_id = 1),'juan.perez@uni.edu.pe','curso_sugerido','📚 Curso recomendado para ti',
        'Basándonos en las ofertas que te interesan, te recomendamos el curso "Python para Data Science" de Coursera. ¡Es gratis!',
        '/capacitate','Ver curso','curso',15,'{"curso_titulo":"Python para Data Science","proveedor":"Coursera","es_gratuito":true,"duracion":"40 horas"}'::jsonb,'normal'
      );
    `)

    await client.query(`
      INSERT INTO public.notificaciones (
        perfil_id, user_email, tipo, titulo, mensaje, url, leida, fecha_lectura, prioridad
      ) VALUES (
        (SELECT id FROM public.perfiles WHERE user_id = 2),'maria.garcia@uni.edu.pe','sistema','🎉 ¡Bienvenida a Bolsa Laboral LeadUNI!',
        'Gracias por registrarte. Completa tu perfil para empezar a postular a ofertas laborales.',
        '/perfil/editar',true, NOW() - INTERVAL '2 days','normal'
      );
    `)

    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Seed error:', err)
    res.status(500).json({ error: 'Seed failed', detail: err.message })
  } finally {
    client.release()
  }
})

// CRUD mínimo
app.get('/api/perfiles', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM public.perfiles ORDER BY id DESC LIMIT 100')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/perfiles', async (req, res) => {
  const { user_id, user_email, nombres, apellidos, carrera, ciclo_actual } = req.body
  try {
    const { rows } = await pool.query(
      'INSERT INTO public.perfiles (user_id, user_email, nombres, apellidos, carrera, ciclo_actual) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [user_id, user_email, nombres, apellidos, carrera, ciclo_actual]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/perfiles/:id', async (req, res) => {
  const { id } = req.params
  const fields = req.body || {}
  const keys = Object.keys(fields)
  if (keys.length === 0) return res.status(400).json({ error: 'No fields provided' })
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
  const values = keys.map(k => fields[k])
  try {
    const { rows } = await pool.query(`UPDATE public.perfiles SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`, [...values, id])
    res.json(rows[0] || null)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/postulaciones', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM public.postulaciones ORDER BY id DESC LIMIT 100')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/postulaciones', async (req, res) => {
  const { oferta_id, oferta_titulo, oferta_slug, empresa_id, empresa_nombre, perfil_id, user_email, estado } = req.body
  try {
    const { rows } = await pool.query(
      `INSERT INTO public.postulaciones (oferta_id, oferta_titulo, oferta_slug, empresa_id, empresa_nombre, perfil_id, user_email, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [oferta_id, oferta_titulo, oferta_slug, empresa_id, empresa_nombre, perfil_id, user_email, estado]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/postulaciones/:id', async (req, res) => {
  const { id } = req.params
  const fields = req.body || {}
  const keys = Object.keys(fields)
  if (keys.length === 0) return res.status(400).json({ error: 'No fields provided' })
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
  const values = keys.map(k => fields[k])
  try {
    const { rows } = await pool.query(`UPDATE public.postulaciones SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`, [...values, id])
    res.json(rows[0] || null)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/notificaciones', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM public.notificaciones ORDER BY id DESC LIMIT 100')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/notificaciones', async (req, res) => {
  const { perfil_id, user_email, tipo, titulo, mensaje } = req.body
  try {
    const { rows } = await pool.query(
      `INSERT INTO public.notificaciones (perfil_id, user_email, tipo, titulo, mensaje)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [perfil_id, user_email, tipo, titulo, mensaje]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/notificaciones/:id', async (req, res) => {
  const { id } = req.params
  const fields = req.body || {}
  const keys = Object.keys(fields)
  if (keys.length === 0) return res.status(400).json({ error: 'No fields provided' })
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
  const values = keys.map(k => fields[k])
  try {
    const { rows } = await pool.query(`UPDATE public.notificaciones SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`, [...values, id])
    res.json(rows[0] || null)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Home
app.get('/', (req, res) => {
  res.send('API backend corriendo ✅')
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' })
})

// Error handler
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Internal Server Error' })
})

// Start server
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`)
})