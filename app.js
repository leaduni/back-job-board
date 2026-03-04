// Simple Express app template (CommonJS-friendly)
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
require("dotenv").config();
const { listTables, ping } = require("./db");
const { pool } = require("./db");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { Resend } = require("resend");

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "secret_key_change_this";

// OTP in-memory store (no DB persistence)
const OTP_TTL_MS = 10 * 60 * 1000; // 10 min
const OTP_COOLDOWN_MS = 60 * 1000; // 60 sec
const OTP_MAX_ATTEMPTS = 5;
const otpStore = new Map(); // key=email, value={ code, expiresAt, attempts, lastSentAt }

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}
function generate4DigitCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function extractErrorDetail(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (typeof err.message === "string" && err.message.trim()) return err.message;
  if (
    err.error &&
    typeof err.error.message === "string" &&
    err.error.message.trim()
  ) {
    return err.error.message;
  }
  if (Array.isArray(err.errors) && err.errors.length > 0) {
    const first = err.errors[0];
    if (typeof first === "string") return first;
    if (first && typeof first.message === "string" && first.message.trim()) {
      return first.message;
    }
  }

  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

// Middleware
app.use(cors());
app.use(express.json());

// Configure Cloudinary (requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer memory storage for multipart uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Healthcheck
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// DB ping
app.get("/api/db/ping", async (req, res) => {
  try {
    const r = await ping();
    res.json({ status: "ok", db: r });
  } catch (err) {
    console.error("DB ping error:", err);
    res.status(500).json({ error: "DB ping failed", detail: err.message });
  }
});

// List DB tables
app.get("/api/db/tables", async (req, res) => {
  try {
    const tables = await listTables();
    res.json({ tables });
  } catch (err) {
    console.error("List tables error:", err);
    res
      .status(500)
      .json({ error: "Failed to list tables", detail: err.message });
  }
});

// Describe table columns and types
// Usage: GET /api/db/describe?table=perfiles&schema=public
app.get("/api/db/describe", async (req, res) => {
  const schema = req.query.schema || "public";
  const table = req.query.table;
  if (!table)
    return res.status(400).json({ error: 'Missing query param "table"' });
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
    `;
    const { rows } = await pool.query(sql, [schema, table]);
    res.json({ schema, table, columns: rows });
  } catch (err) {
    console.error("Describe table error:", err);
    res
      .status(500)
      .json({ error: "Failed to describe table", detail: err.message });
  }
});

// --- AUTHENTICATION HELPERS ---

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, "sha512")
    .toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, storedHash) {
  const hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, "sha512")
    .toString("hex");
  return hash === storedHash;
}

// --- AUTHENTICATION MIDDLEWARE ---

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) return res.status(401).json({ error: "Null token" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
}

async function getCandidateIdByUserId(userId) {
  const { rows } = await pool.query(
    "SELECT id FROM public.candidates WHERE user_id = $1 LIMIT 1",
    [userId],
  );
  return rows[0]?.id || null;
}

// --- AUTHENTICATION ROUTES ---

// Get current user profile (User + Candidate data)
app.get("/api/me", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch user basic info
    const userQuery =
      "SELECT id, email, role, created_at FROM public.users WHERE id = $1";
    const { rows: userRows } = await pool.query(userQuery, [userId]);

    if (userRows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const user = userRows[0];

    // Fetch candidate profile info
    const candidateQuery = "SELECT * FROM public.candidates WHERE user_id = $1";
    const { rows: candidateRows } = await pool.query(candidateQuery, [userId]);
    const candidate = candidateRows[0] || null;

    res.json({
      user,
      candidate,
    });
  } catch (err) {
    console.error("Get profile error:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch profile", detail: err.message });
  }
});

// Search skills by name (typeahead)
// Usage: GET /api/skills/search?q=python&limit=10
app.get("/api/skills/search", async (req, res) => {
  const queryText = String(req.query.q || "").trim();
  const limitRaw = Number.parseInt(String(req.query.limit || "10"), 10);
  const limit = Number.isNaN(limitRaw)
    ? 10
    : Math.min(Math.max(limitRaw, 1), 50);

  if (!queryText) {
    return res.status(400).json({ error: "Query param q is required" });
  }

  try {
    const sql = `
      SELECT id, name
      FROM public.skills
      WHERE name ILIKE $1
      ORDER BY
        CASE WHEN LOWER(name) = LOWER($2) THEN 0 ELSE 1 END,
        name ASC
      LIMIT $3
    `;
    const { rows } = await pool.query(sql, [
      `%${queryText}%`,
      queryText,
      limit,
    ]);
    return res.json({ items: rows });
  } catch (err) {
    console.error("Search skills error:", err);
    return res
      .status(500)
      .json({ error: "Failed to search skills", detail: err.message });
  }
});

// Create a custom skill
app.post("/api/skills", authenticateToken, async (req, res) => {
  const name = String(req.body?.name || "").trim();

  if (!name) {
    return res.status(400).json({ error: "Skill name is required" });
  }

  try {
    const existing = await pool.query(
      "SELECT id, name FROM public.skills WHERE LOWER(name) = LOWER($1) LIMIT 1",
      [name],
    );

    if (existing.rows.length > 0) {
      return res.json({ ok: true, created: false, skill: existing.rows[0] });
    }

    const { rows } = await pool.query(
      "INSERT INTO public.skills (name) VALUES ($1) RETURNING id, name",
      [name],
    );

    return res.status(201).json({ ok: true, created: true, skill: rows[0] });
  } catch (err) {
    console.error("Create skill error:", err);
    return res
      .status(500)
      .json({ error: "Failed to create skill", detail: err.message });
  }
});

// Get authenticated candidate skills
app.get("/api/me/candidate/skills", authenticateToken, async (req, res) => {
  try {
    const candidateId = await getCandidateIdByUserId(req.user.id);

    if (!candidateId) {
      return res.status(404).json({ error: "Candidate profile not found" });
    }

    const { rows } = await pool.query(
      `
      SELECT s.id, s.name
      FROM public.candidates_skills cs
      JOIN public.skills s ON s.id = cs.skill_id
      WHERE cs.candidate_id = $1
      ORDER BY s.name ASC
      `,
      [candidateId],
    );

    return res.json({ items: rows });
  } catch (err) {
    console.error("Get candidate skills error:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch candidate skills", detail: err.message });
  }
});

// Get skills by candidate id
app.get("/api/candidates/:candidateId/skills", async (req, res) => {
  const candidateId = Number.parseInt(String(req.params.candidateId), 10);

  if (!Number.isInteger(candidateId) || candidateId <= 0) {
    return res.status(400).json({ error: "Invalid candidateId" });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT s.id, s.name
      FROM public.candidates_skills cs
      JOIN public.skills s ON s.id = cs.skill_id
      WHERE cs.candidate_id = $1
      ORDER BY s.name ASC
      `,
      [candidateId],
    );

    return res.json({ items: rows });
  } catch (err) {
    console.error("Get skills by candidate id error:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch candidate skills", detail: err.message });
  }
});

// Attach skills to authenticated candidate profile
// Body: { skillIds?: number[], skillNames?: string[] }
app.post("/api/me/candidate/skills", authenticateToken, async (req, res) => {
  const skillIdsInput = Array.isArray(req.body?.skillIds)
    ? req.body.skillIds
    : [];
  const skillNamesInput = Array.isArray(req.body?.skillNames)
    ? req.body.skillNames
    : [];

  const normalizedSkillIds = [
    ...new Set(
      skillIdsInput
        .map((value) => Number.parseInt(String(value), 10))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ];

  const normalizedSkillNames = [
    ...new Set(
      skillNamesInput
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > 0),
    ),
  ];

  if (normalizedSkillIds.length === 0 && normalizedSkillNames.length === 0) {
    return res.status(400).json({
      error: "Provide at least one skill in skillIds or skillNames",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const candidateId = await getCandidateIdByUserId(req.user.id);
    if (!candidateId) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Candidate profile not found" });
    }

    let allSkillIds = [...normalizedSkillIds];

    if (normalizedSkillIds.length > 0) {
      const existingById = await client.query(
        "SELECT id FROM public.skills WHERE id = ANY($1::int[])",
        [normalizedSkillIds],
      );
      const existingSet = new Set(existingById.rows.map((row) => row.id));
      const missingSkillIds = normalizedSkillIds.filter(
        (id) => !existingSet.has(id),
      );

      if (missingSkillIds.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "Some skillIds do not exist",
          missingSkillIds,
        });
      }
    }

    for (const skillName of normalizedSkillNames) {
      const found = await client.query(
        "SELECT id FROM public.skills WHERE LOWER(name) = LOWER($1) LIMIT 1",
        [skillName],
      );

      if (found.rows.length > 0) {
        allSkillIds.push(found.rows[0].id);
        continue;
      }

      const created = await client.query(
        "INSERT INTO public.skills (name) VALUES ($1) RETURNING id",
        [skillName],
      );
      allSkillIds.push(created.rows[0].id);
    }

    allSkillIds = [...new Set(allSkillIds)];

    if (allSkillIds.length > 0) {
      const existingLinks = await client.query(
        "SELECT skill_id FROM public.candidates_skills WHERE candidate_id = $1 AND skill_id = ANY($2::int[])",
        [candidateId, allSkillIds],
      );
      const linkedSet = new Set(existingLinks.rows.map((row) => row.skill_id));
      const toInsert = allSkillIds.filter((skillId) => !linkedSet.has(skillId));

      if (toInsert.length > 0) {
        await client.query(
          `
          INSERT INTO public.candidates_skills (candidate_id, skill_id)
          SELECT $1, UNNEST($2::int[])
          `,
          [candidateId, toInsert],
        );
      }
    }

    const result = await client.query(
      `
      SELECT s.id, s.name
      FROM public.candidates_skills cs
      JOIN public.skills s ON s.id = cs.skill_id
      WHERE cs.candidate_id = $1
      ORDER BY s.name ASC
      `,
      [candidateId],
    );

    await client.query("COMMIT");
    return res.status(201).json({
      ok: true,
      message: "Skills attached successfully",
      items: result.rows,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Attach candidate skills error:", err);
    return res
      .status(500)
      .json({ error: "Failed to attach skills", detail: err.message });
  } finally {
    client.release();
  }
});

// Remove one skill from authenticated candidate profile
app.delete(
  "/api/me/candidate/skills/:skillId",
  authenticateToken,
  async (req, res) => {
    const skillId = Number.parseInt(String(req.params.skillId), 10);

    if (!Number.isInteger(skillId) || skillId <= 0) {
      return res.status(400).json({ error: "Invalid skillId" });
    }

    try {
      const candidateId = await getCandidateIdByUserId(req.user.id);

      if (!candidateId) {
        return res.status(404).json({ error: "Candidate profile not found" });
      }

      const deleted = await pool.query(
        "DELETE FROM public.candidates_skills WHERE candidate_id = $1 AND skill_id = $2 RETURNING candidate_id, skill_id",
        [candidateId, skillId],
      );

      if (deleted.rows.length === 0) {
        return res
          .status(404)
          .json({ error: "Skill not attached to candidate" });
      }

      const { rows } = await pool.query(
        `
        SELECT s.id, s.name
        FROM public.candidates_skills cs
        JOIN public.skills s ON s.id = cs.skill_id
        WHERE cs.candidate_id = $1
        ORDER BY s.name ASC
        `,
        [candidateId],
      );

      return res.json({
        ok: true,
        message: "Skill removed successfully",
        items: rows,
      });
    } catch (err) {
      console.error("Remove candidate skill error:", err);
      return res
        .status(500)
        .json({ error: "Failed to remove skill", detail: err.message });
    }
  },
);

// Update current user's candidate profile
app.patch("/api/me/candidate", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const fields = req.body || {};

    // Whitelist allowed fields to prevent SQL injection or updating restricted columns
    const allowedFields = [
      "first_name",
      "last_name",
      "phone",
      "birth_date",
      "location",
      "major_id",
      "carrera",
      "start_year",
      "end_year",
      "bio",
      "linkedin_url",
      "github_url",
      "portfolio_url",
      "cv_url",
      "cv_last_modified",
    ];

    const updates = [];
    const values = [];
    let valueIndex = 1;

    for (const key of Object.keys(fields)) {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = $${valueIndex}`);
        // Convertir strings vacíos a null para fechas y números; mantener '' para texto si aplica
        let val = fields[key];
        if (val === "" || val === undefined) {
          val = null;
        }
        if (key === "birth_date" && val && typeof val === "string") {
          val = val.trim() || null;
        }
        if (
          (key === "end_year" || key === "start_year" || key === "major_id") &&
          val !== null
        ) {
          val = parseInt(val, 10);
          if (isNaN(val)) val = null;
        }
        values.push(val);
        valueIndex++;
      }
    }

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ error: "No valid fields provided for update" });
    }

    // Add updated_at
    updates.push(`updated_at = NOW()`);

    // Add userId to values for the WHERE clause
    values.push(userId);

    const query = `
      UPDATE public.candidates 
      SET ${updates.join(", ")} 
      WHERE user_id = $${valueIndex} 
      RETURNING *
    `;

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Candidate profile not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Update candidate error:", err);
    res.status(500).json({
      error: "Failed to update candidate profile",
      detail: err.message,
    });
  }
});

// Send verification code (OTP)
app.post("/api/auth/send-code", async (req, res) => {
  const email = normalizeEmail(req.body?.email);

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  if (!process.env.RESEND_API_KEY) {
    return res
      .status(500)
      .json({ error: "RESEND_API_KEY is not configured on server" });
  }

  try {
    const now = Date.now();
    const cached = otpStore.get(email);

    // Anti-spam cooldown
    if (cached && now - cached.lastSentAt < OTP_COOLDOWN_MS) {
      return res
        .status(429)
        .json({ error: "Wait 60 seconds before requesting another code" });
    }

    const code = generate4DigitCode();

    otpStore.set(email, {
      code,
      expiresAt: now + OTP_TTL_MS,
      attempts: 0,
      lastSentAt: now,
    });

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
      to: [email],
      subject: "Código de verificación - Bolsa Laboral LEAD UNI",
      html: `
        <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.5;">
          <h2>Verifica tu correo</h2>
          <p>Tu código de verificación es:</p>
          <p style="font-size: 32px; font-weight: 700; letter-spacing: 4px; margin: 16px 0;">${code}</p>
          <p>Este código vence en 10 minutos.</p>
        </div>
      `,
    });

    if (error) {
      throw new Error(extractErrorDetail(error));
    }

    return res.json({ ok: true, message: "Code sent successfully" });
  } catch (err) {
    const detail = extractErrorDetail(err);
    console.error("Send code error:", detail, err);
    return res
      .status(500)
      .json({ error: "Failed to send verification code", detail });
  }
});

// Reset password (requires OTP code)
app.post("/api/auth/reset-password", async (req, res) => {
  const normalizedEmail = normalizeEmail(req.body?.email);
  const code = String(
    req.body?.code ?? req.body?.verificationCode ?? "",
  ).trim();
  const newPassword = String(
    req.body?.new_password ?? req.body?.newPassword ?? req.body?.password ?? "",
  );

  if (!normalizedEmail || !code || !newPassword) {
    return res.status(400).json({
      error: "Email, code, and new password are required",
    });
  }

  if (newPassword.length < 6) {
    return res
      .status(400)
      .json({ error: "New password must be at least 6 characters" });
  }

  const pending = otpStore.get(normalizedEmail);

  if (!pending) {
    return res
      .status(404)
      .json({ error: "No verification code found for this email" });
  }

  if (Date.now() > pending.expiresAt) {
    otpStore.delete(normalizedEmail);
    return res.status(410).json({ error: "Code expired. Request a new one" });
  }

  if (pending.attempts >= OTP_MAX_ATTEMPTS) {
    otpStore.delete(normalizedEmail);
    return res
      .status(429)
      .json({ error: "Too many attempts. Request a new code" });
  }

  if (pending.code !== code) {
    pending.attempts += 1;
    otpStore.set(normalizedEmail, pending);
    return res.status(400).json({ error: "Invalid verification code" });
  }

  try {
    const checkUser = await pool.query(
      "SELECT id FROM public.users WHERE email = $1",
      [normalizedEmail],
    );

    if (checkUser.rows.length === 0) {
      otpStore.delete(normalizedEmail);
      return res.status(404).json({ error: "User not found" });
    }

    const { salt, hash } = hashPassword(newPassword);
    await pool.query(
      "UPDATE public.users SET salt = $1, hash = $2 WHERE email = $3",
      [salt, hash, normalizedEmail],
    );

    otpStore.delete(normalizedEmail);

    return res.json({ ok: true, message: "Password reset successful" });
  } catch (err) {
    const detail = extractErrorDetail(err);
    console.error("Reset password error:", detail, err);
    return res.status(500).json({ error: "Password reset failed", detail });
  }
});

// Register (requires OTP code)
app.post("/api/auth/register", async (req, res) => {
  const { email, password, role, first_name, last_name, code } = req.body;

  if (!email || !password || !first_name || !last_name || !code) {
    return res.status(400).json({
      error: "Email, password, first_name, last_name, and code are required",
    });
  }

  const normalizedEmail = normalizeEmail(email);
  const pending = otpStore.get(normalizedEmail);

  if (!pending) {
    return res
      .status(404)
      .json({ error: "No verification code found for this email" });
  }

  if (Date.now() > pending.expiresAt) {
    otpStore.delete(normalizedEmail);
    return res.status(410).json({ error: "Code expired. Request a new one" });
  }

  if (pending.attempts >= OTP_MAX_ATTEMPTS) {
    otpStore.delete(normalizedEmail);
    return res
      .status(429)
      .json({ error: "Too many attempts. Request a new code" });
  }

  if (pending.code !== String(code).trim()) {
    pending.attempts += 1;
    otpStore.set(normalizedEmail, pending);
    return res.status(400).json({ error: "Invalid verification code" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check if user exists
    const checkUser = await client.query(
      "SELECT id FROM public.users WHERE email = $1",
      [normalizedEmail],
    );
    if (checkUser.rows.length > 0) {
      await client.query("ROLLBACK");
      otpStore.delete(normalizedEmail);
      return res.status(409).json({ error: "User already exists" });
    }

    // Hash password
    const { salt, hash } = hashPassword(password);

    // Insert user
    // role is optional, defaults to 'user' in DB if null
    const userQuery = `
      INSERT INTO public.users (email, salt, hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, role, created_at
    `;
    const userValues = [normalizedEmail, salt, hash, role || "user"];
    const userRes = await client.query(userQuery, userValues);
    const newUser = userRes.rows[0];

    // Insert candidate (linked to user)
    const candidateQuery = `
      INSERT INTO public.candidates (user_id, first_name, last_name)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const candidateValues = [newUser.id, first_name, last_name];
    const candidateRes = await client.query(candidateQuery, candidateValues);
    const newCandidate = candidateRes.rows[0];

    await client.query("COMMIT");

    // OTP no longer needed
    otpStore.delete(normalizedEmail);

    // Create JWT
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.status(201).json({
      message: "User registered successfully",
      user: newUser,
      candidate: newCandidate,
      token,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed", detail: err.message });
  } finally {
    client.release();
  }
});

// Register empresa: crea usuario en backend y empresa en CMS
app.post("/api/auth/register-empresa", async (req, res) => {
  const {
    email,
    password,
    nombre_empresa,
    razon_social,
    ruc,
    nombres_contacto,
    apellidos_contacto,
    sector,
    telefono_contacto,
    sitio_web,
    direccion,
    tiene_convenio,
  } = req.body;

  if (!email || !password || !nombre_empresa || !sector) {
    return res.status(400).json({
      error: "Email, password, nombre_empresa y sector son obligatorios",
    });
  }

  const CMS_API_URL = process.env.CMS_API_URL || "http://localhost:3000";

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const checkUser = await client.query(
      "SELECT id FROM public.users WHERE email = $1",
      [email],
    );
    if (checkUser.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "El correo ya está registrado" });
    }

    const { salt, hash } = hashPassword(password);

    const userQuery = `
      INSERT INTO public.users (email, salt, hash, role)
      VALUES ($1, $2, $3, 'company')
      RETURNING id, email, role, created_at
    `;
    const userRes = await client.query(userQuery, [email, salt, hash]);
    const newUser = userRes.rows[0];

    await client.query("COMMIT");

    const persona_contacto = [nombres_contacto, apellidos_contacto]
      .filter(Boolean)
      .join(" ");

    const cmsRes = await fetch(`${CMS_API_URL}/api/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre_comercial: nombre_empresa,
        razon_social: razon_social || null,
        ruc: ruc || null,
        sector,
        email_contacto: email,
        persona_contacto: persona_contacto || null,
        telefono_contacto: telefono_contacto || null,
        sitio_web: sitio_web || null,
        direccion: direccion || null,
        tiene_convenio: !!tiene_convenio,
      }),
    });

    if (!cmsRes.ok) {
      const errData = await cmsRes.json().catch(() => ({}));
      console.error("CMS companies create error:", errData);
    }

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.status(201).json({
      message: "Empresa registrada correctamente",
      user: newUser,
      token,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Register empresa error:", err);
    res
      .status(500)
      .json({ error: "Error al registrar empresa", detail: err.message });
  } finally {
    client.release();
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    // Find user
    const query = "SELECT * FROM public.users WHERE email = $1";
    const { rows } = await pool.query(query, [normalizedEmail]);

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = rows[0];

    // Verify password
    if (!verifyPassword(password, user.salt, user.hash)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Create JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" },
    );

    // Remove sensitive data from response
    delete user.salt;
    delete user.hash;
    delete user.reset_password_token;

    res.json({
      message: "Login successful",
      user,
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed", detail: err.message });
  }
});

// Upload CV to Cloudinary folder "CVs LEAD"
// - Multipart: field name "file" (PDF/DOC/DOCX etc.)
// - JSON: { fileUrl: 'https://...' } or data URI
app.post("/api/upload/cv", upload.single("file"), async (req, res) => {
  try {
    const folder = "CVs LEAD";

    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder, resource_type: "auto" },
          (error, uploadResult) => {
            if (error) return reject(error);
            resolve(uploadResult);
          },
        );
        stream.end(req.file.buffer);
      });
      return res.json({ ok: true, result });
    }

    const { fileUrl, publicId } = req.body || {};
    if (!fileUrl) {
      return res.status(400).json({
        ok: false,
        error: 'Provide multipart field "file" or body.fileUrl',
      });
    }

    const result = await cloudinary.uploader.upload(fileUrl, {
      folder,
      public_id: publicId || undefined,
      resource_type: "auto",
    });
    res.json({ ok: true, result });
  } catch (err) {
    console.error("Cloudinary upload error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Seed endpoint: ejecuta los INSERTs de ejemplo en una transacción
app.post("/api/seed", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

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
    `);

    // Postulaciones
    await client.query(`
      INSERT INTO public.postulaciones (
        oferta_id, empresa_id, perfil_id, carta_presentacion, cv_url,
        estado, ip_address
      ) VALUES (
        101,1,
        (SELECT id FROM public.perfiles WHERE user_id = 1),
        'Estimado equipo de TechCorp,\n\nMe dirijo a ustedes con gran entusiasmo para postular al puesto de Practicante de Desarrollo Backend...\n\nAtentamente,\nJuan Carlos Pérez',
        'https://res.cloudinary.com/leaduni/raw/upload/v1234567890/leaduni/cvs/cv_1_1234567890.pdf','enviada','192.168.1.100'
      );
    `);

    await client.query(`
      INSERT INTO public.postulaciones (
        oferta_id,empresa_id,perfil_id,
        carta_presentacion, cv_url, estado, notas_internas, historial_estados, email_enviado, fecha_email_enviado
      ) VALUES (
        102,2,
        (SELECT id FROM public.perfiles WHERE user_id = 2),
        'Estimados,\n\nCon gran interés me postulo al puesto de Analista de Mejora Continua...',
        'https://res.cloudinary.com/leaduni/raw/upload/v1234567890/leaduni/cvs/cv_2_1234567890.pdf','en_revision',
        'Perfil muy interesante, experiencia previa en la empresa es un plus',
        '[{"estado":"enviada","fecha":"2024-01-15T10:30:00Z","nota":"Postulación recibida"},{"estado":"en_revision","fecha":"2024-01-16T14:20:00Z","nota":"Perfil muy interesante, experiencia previa en la empresa es un plus"}]'::jsonb,
        true,'2024-01-15 10:35:00'
      );
    `);

    await client.query(`
      INSERT INTO public.postulaciones (
        oferta_id,empresa_id, perfil_id, carta_presentacion, cv_url,
        respuestas_adicionales, estado, historial_estados, email_enviado
      ) VALUES (
        103,3,
        (SELECT id FROM public.perfiles WHERE user_id = 3),
        'Estimado equipo de Ferreyros,\n\nMe complace postular al puesto de Ingeniero de Diseño Mecánico Junior...',
        'https://res.cloudinary.com/leaduni/raw/upload/v1234567890/leaduni/cvs/cv_3_1234567890.pdf',
        '[{"pregunta":"¿Cuántos años de experiencia tienes con SolidWorks?","respuesta":"Tengo 2 años..."},{"pregunta":"¿Estás disponible para trabajar en campo?","respuesta":"Sí, estoy completamente disponible..."}]'::jsonb,
        'entrevista_programada',
        '[{"estado":"enviada","fecha":"2024-01-10T09:00:00Z","nota":"Postulación recibida"},{"estado":"en_revision","fecha":"2024-01-11T11:00:00Z","nota":"Candidato con experiencia previa en la empresa"},{"estado":"entrevista_programada","fecha":"2024-01-12T16:00:00Z","nota":"Entrevista programada para el 20/01/2024 a las 10:00 AM"}]'::jsonb,
        true
      );
    `);

    await client.query(`
      INSERT INTO public.postulaciones (
        oferta_id, empresa_id, perfil_id, carta_presentacion, cv_url,
        estado, notas_internas, historial_estados, email_enviado
      ) VALUES (
        104,4,
        (SELECT id FROM public.perfiles WHERE user_id = 1),
        'Estimado equipo,\n\nMe interesa el puesto de Desarrollador Full Stack Senior...',
        'https://res.cloudinary.com/leaduni/raw/upload/v1234567890/leaduni/cvs/cv_1_1234567890.pdf','rechazada',
        'Perfil junior, el puesto requiere 3+ años de experiencia',
        '[{"estado":"enviada","fecha":"2024-01-08T14:00:00Z","nota":"Postulación recibida"},{"estado":"en_revision","fecha":"2024-01-09T10:00:00Z","nota":"Revisando perfil"},{"estado":"rechazada","fecha":"2024-01-09T15:00:00Z","nota":"Perfil junior, el puesto requiere 3+ años de experiencia"}]'::jsonb,
        true
      );
    `);

    // Notificaciones
    await client.query(`
      INSERT INTO public.notificaciones (
        perfil_id, user_email, tipo, titulo, mensaje, url, entidad_tipo, entidad_id, metadata, prioridad
      ) VALUES (
        (SELECT id FROM public.perfiles WHERE user_id = 1),'juan.perez@uni.edu.pe','postulacion_enviada','✅ Postulación enviada exitosamente',
        'Tu postulación a "Practicante de Desarrollo Backend" en TechCorp Perú ha sido enviada correctamente. Te notificaremos cuando haya novedades.',
        '/mis-postulaciones','postulacion',101,'{"oferta_titulo":"Practicante de Desarrollo Backend","empresa":"TechCorp Perú"}'::jsonb,'normal'
      );
    `);

    await client.query(`
      INSERT INTO public.notificaciones (
        perfil_id, user_email, tipo, titulo, mensaje, url, entidad_tipo, entidad_id, metadata, prioridad, leida
      ) VALUES (
        (SELECT id FROM public.perfiles WHERE user_id = 2),'maria.garcia@uni.edu.pe','cambio_estado_postulacion','🎉 Tu postulación está en revisión',
        'Alicorp S.A. está revisando tu postulación para "Analista de Mejora Continua". ¡Mantente atento a tu correo!',
        '/mis-postulaciones','postulacion',102,'{"oferta_titulo":"Analista de Mejora Continua","empresa":"Alicorp S.A.","estado_anterior":"enviada","estado_nuevo":"en_revision"}'::jsonb,
        'alta',false
      );
    `);

    await client.query(`
      INSERT INTO public.notificaciones (
        perfil_id, user_email, tipo, titulo, mensaje, url, entidad_tipo, entidad_id, metadata, prioridad
      ) VALUES (
        (SELECT id FROM public.perfiles WHERE user_id = 3),'carlos.rodriguez@uni.edu.pe','cambio_estado_postulacion','📅 ¡Entrevista programada!',
        'Ferreyros S.A. ha programado una entrevista contigo para el puesto de "Ingeniero de Diseño Mecánico Junior" el día 20/01/2024 a las 10:00 AM.',
        '/mis-postulaciones','postulacion',103,'{"oferta_titulo":"Ingeniero de Diseño Mecánico Junior","empresa":"Ferreyros S.A.","fecha_entrevista":"2024-01-20T10:00:00Z","modalidad":"presencial","direccion":"Av. Cristóbal de Peralta Norte 820, Surco"}'::jsonb,
        'urgente'
      );
    `);

    await client.query(`
      INSERT INTO public.notificaciones (
        perfil_id, user_email, tipo, titulo, mensaje, url, metadata, prioridad
      ) VALUES (
        (SELECT id FROM public.perfiles WHERE user_id = 1),'juan.perez@uni.edu.pe','perfil_incompleto','⚠️ Completa tu perfil',
        'Tu perfil está al 45%. Complétalo para tener más oportunidades de ser contactado por empresas. Agrega tu CV, experiencia y proyectos.',
        '/perfil/editar','{"porcentaje_actual":45,"campos_faltantes":["cv_url","experiencia_laboral","proyectos"]}'::jsonb,'baja'
      );
    `);

    await client.query(`
      INSERT INTO public.notificaciones (
        perfil_id, user_email, tipo, titulo, mensaje, url, entidad_tipo, entidad_id, metadata, prioridad
      ) VALUES (
        (SELECT id FROM public.perfiles WHERE user_id = 1),'juan.perez@uni.edu.pe','curso_sugerido','📚 Curso recomendado para ti',
        'Basándonos en las ofertas que te interesan, te recomendamos el curso "Python para Data Science" de Coursera. ¡Es gratis!',
        '/capacitate','curso',15,'{"curso_titulo":"Python para Data Science","proveedor":"Coursera","es_gratuito":true,"duracion":"40 horas"}'::jsonb,'normal'
      );
    `);

    await client.query(`
      INSERT INTO public.notificaciones (
        perfil_id, user_email, tipo, titulo, mensaje, url, leida, fecha_lectura, prioridad
      ) VALUES (
        (SELECT id FROM public.perfiles WHERE user_id = 2),'maria.garcia@uni.edu.pe','sistema','🎉 ¡Bienvenida a Bolsa Laboral LeadUNI!',
        'Gracias por registrarte. Completa tu perfil para empezar a postular a ofertas laborales.',
        '/perfil/editar',true, NOW() - INTERVAL '2 days','normal'
      );
    `);

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed error:", err);
    res.status(500).json({ error: "Seed failed", detail: err.message });
  } finally {
    client.release();
  }
});

// CRUD mínimo
app.get("/api/perfiles", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM public.perfiles ORDER BY id DESC LIMIT 100",
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/perfiles", async (req, res) => {
  const { user_id, user_email, nombres, apellidos, carrera, ciclo_actual } =
    req.body;
  try {
    const { rows } = await pool.query(
      "INSERT INTO public.perfiles (user_id, user_email, nombres, apellidos, carrera, ciclo_actual) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [user_id, user_email, nombres, apellidos, carrera, ciclo_actual],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/perfiles/:id", async (req, res) => {
  const { id } = req.params;
  const fields = req.body || {};
  const keys = Object.keys(fields);
  if (keys.length === 0)
    return res.status(400).json({ error: "No fields provided" });
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  const values = keys.map((k) => fields[k]);
  try {
    const { rows } = await pool.query(
      `UPDATE public.perfiles SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id],
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/postulaciones", async (req, res) => {
  try {
    const { perfil_id } = req.query;
    let query, values;
    if (perfil_id) {
      query = `
        SELECT p.*, c.nombre_comercial, pr.titulo
        FROM public.postulaciones p
        JOIN public.companies c ON p.empresa_id = c.id
        JOIN public.projects pr ON p.oferta_id = pr.id
        WHERE p.perfil_id = $1
        ORDER BY p.id DESC LIMIT 100
      `;
      values = [perfil_id];
      const result = await pool.query(query, values);
      return res.json(result.rows);
    }
    const result = await pool.query(
      `SELECT * FROM public.postulaciones ORDER BY id DESC LIMIT 100`,
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/postulaciones", async (req, res) => {
  const { oferta_id, empresa_id, perfil_id, estado } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO public.postulaciones (oferta_id, empresa_id, perfil_id, estado)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [oferta_id, empresa_id, perfil_id, estado],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/postulaciones/:id", async (req, res) => {
  const { id } = req.params;
  const fields = req.body || {};
  const keys = Object.keys(fields);
  if (keys.length === 0)
    return res.status(400).json({ error: "No fields provided" });
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  const values = keys.map((k) => fields[k]);
  try {
    const { rows } = await pool.query(
      `UPDATE public.postulaciones SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id],
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH solo para cambiar el estado de una postulación
app.patch("/api/postulaciones/:id/estado", async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  if (!estado) {
    return res.status(400).json({ error: "Falta el campo 'estado'" });
  }
  try {
    const { rows } = await pool.query(
      "UPDATE public.postulaciones SET estado = $1 WHERE id = $2 RETURNING *",
      [estado, id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Postulación no encontrada" });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/notificaciones", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM public.notificaciones ORDER BY id DESC LIMIT 100",
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/notificaciones", async (req, res) => {
  const { perfil_id, user_email, tipo, titulo, mensaje } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO public.notificaciones (perfil_id, user_email, tipo, titulo, mensaje)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [perfil_id, user_email, tipo, titulo, mensaje],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/notificaciones/:id", async (req, res) => {
  const { id } = req.params;
  const fields = req.body || {};
  const keys = Object.keys(fields);
  if (keys.length === 0)
    return res.status(400).json({ error: "No fields provided" });
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  const values = keys.map((k) => fields[k]);
  try {
    const { rows } = await pool.query(
      `UPDATE public.notificaciones SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id],
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Home
app.get("/", (req, res) => {
  res.send("API backend corriendo ✅");
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
