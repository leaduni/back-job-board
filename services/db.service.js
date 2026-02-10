const { pool, listTables, ping } = require('../db');

const getHealth = () => {
  return { status: 'ok', uptime: process.uptime() };
};

const pingDb = async () => {
  return await ping();
};

const getTables = async () => {
  return await listTables();
};

const describeTable = async (schema, table) => {
  if (!table) throw new Error('Missing query param "table"');

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
  `;
  const { rows } = await pool.query(sql, [schema, table]);
  return { schema, table, columns: rows };
};

const seedDb = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ... (El contenido de los INSERTs se mantiene igual que en app.js) ...
    // Perfiles
    await client.query(`
      INSERT INTO public.perfiles (user_id, user_email, nombres, apellidos, carrera, ciclo_actual)
      VALUES (1,'juan.perez@uni.edu.pe','Juan Carlos','Pérez López','Ingeniería de Sistemas',8);
    `);
    
    try {
    await client.query(`
      INSERT INTO public.perfiles (
        user_id, user_email, nombres, apellidos, telefono, fecha_nacimiento, carrera, ciclo_actual, anio_egreso,
        promedio_ponderado, departamento, distrito, linkedin_url, github_url, portfolio_url,
        cv_url, cv_filename, cv_uploaded_at, sobre_mi, habilidades_tecnicas, habilidades_blandas,
        experiencia_laboral, proyectos, idiomas, modalidad_preferida, disponibilidad,
        expectativa_salarial_min, expectativa_salarial_max, perfil_publico, busca_empleo, disponible_inmediato
      ) VALUES (
        2,'maria.garcia@uni.edu.pe','María','García Torres','+51 987654321','2001-05-15','Ingeniería Industrial',10,2024,9.80,
        'Lima','San Isidro','https://linkedin.com/in/mariagarcia','https://github.com/mariagarcia','https://mariagarcia.dev',
        'https://res.cloudinary.com/leaduni/raw/upload/v1234567890/leaduni/cvs/cv_2_1234567890.pdf','CV_Maria_Garcia.pdf', NOW(),
        'Estudiante de últimos ciclos apasionada por la optimización de procesos y el análisis de datos. Busco oportunidades para aplicar mis conocimientos en proyectos reales.',
        'Python, SQL, Power BI, Excel Avanzado, Minitab, Arena Simulation',
        'Liderazgo, Trabajo en equipo, Resolución de problemas, Comunicación efectiva',
        '[{"empresa":"Alicorp S.A.","cargo":"Practicante de Mejora Continua","descripcion":"Implementación de metodología Lean en líneas de producción, reduciendo tiempos de cambio en 25%","fecha_inicio":"2023-03","fecha_fin":"2023-12","actualmente":false},{"empresa":"Backus","cargo":"Practicante de Planeamiento","descripcion":"Análisis de demanda y optimización de inventarios usando Python","fecha_inicio":"2024-01","fecha_fin":null,"actualmente":true}]'::jsonb,
        '[{"nombre":"Sistema de Gestión de Inventarios","descripcion":"Aplicación web para control de inventarios con alertas automáticas de stock bajo","url":"https://inventory-system.vercel.app","repositorio":"https://github.com/mariagarcia/inventory-system","tecnologias":"React, Node.js, PostgreSQL, Chart.js","fecha":"2024-02"},{"nombre":"Dashboard de Indicadores KPI","descripcion":"Dashboard interactivo para visualización de KPIs operacionales en tiempo real","url":null,"repositorio":"https://github.com/mariagarcia/kpi-dashboard","tecnologias":"Python, Dash, Plotly, Pandas","fecha":"2023-11"}]'::jsonb,
        '[{"idioma":"Español","nivel":"nativo","certificacion":null},{"idioma":"Inglés","nivel":"avanzado","certificacion":"TOEFL ITP 580"},{"idioma":"Portugués","nivel":"basico","certificacion":null}]'::jsonb,
        'hibrido','Inmediata, 40 horas semanales',2000.00,2500.00,true,true,true
      );
    `);
    } catch (e) {
      throw new Error(`Seed perfiles (Maria) failed: ${e.message}`);
    }

    // ... (más inserts) ...

    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  getHealth,
  pingDb,
  getTables,
  describeTable,
  seedDb,
};