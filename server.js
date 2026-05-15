// server.js - Sistema de Cronogramas (CORREGIDO)
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const { open } = require('sqlite');

const app = express();
const PORT = 3000;

const baseDir = path.dirname(process.execPath);
const isDevelopment = process.env.NODE_ENV !== 'production' || !process.execPath.includes('.exe');
const finalBaseDir = isDevelopment ? process.cwd() : baseDir;

console.log(`📁 Directorio base: ${finalBaseDir}`);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(finalBaseDir));

app.get("/", (req, res) => {
    res.sendFile(path.join(finalBaseDir, "login.html"));
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

// Forzar HTTPS en producción
app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
        return res.redirect('https://' + req.headers.host + req.url);
    }
    next();
});

// ========================================
// BASE DE DATOS
// ========================================

let db;

async function initDatabase() {
    try {
        const dataDir = path.join(finalBaseDir, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            console.log(`📁 Carpeta data creada: ${dataDir}`);
        }

        const dbPath = path.join(dataDir, 'cronogramas.db');
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });
        console.log(`✅ Base de datos: ${dbPath}`);

        // Tablas del sistema de cronogramas
        await db.exec(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                rol TEXT DEFAULT 'admin',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS proyectos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                descripcion TEXT,
                color TEXT DEFAULT '#2A6DFF',
                estado TEXT DEFAULT 'activo',
                fecha_inicio DATE,
                fecha_fin DATE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS categorias (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                color TEXT DEFAULT '#6C757D',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS actividades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                proyecto_id INTEGER,
                categoria_id INTEGER,
                titulo TEXT NOT NULL,
                descripcion TEXT,
                fecha DATE NOT NULL,
                hora_inicio TIME,
                hora_fin TIME,
                prioridad TEXT DEFAULT 'media',
                completado BOOLEAN DEFAULT 0,
                responsable TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
                FOREIGN KEY (categoria_id) REFERENCES categorias(id)
            );
            
            CREATE TABLE IF NOT EXISTS recursos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                tipo TEXT,
                disponible BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS actividad_recursos (
                actividad_id INTEGER,
                recurso_id INTEGER,
                FOREIGN KEY (actividad_id) REFERENCES actividades(id),
                FOREIGN KEY (recurso_id) REFERENCES recursos(id)
            );
            
            CREATE TABLE IF NOT EXISTS horarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                persona TEXT NOT NULL,
                ubicacion TEXT NOT NULL,
                dia_semana INTEGER NOT NULL,
                hora_inicio TEXT NOT NULL,
                hora_fin TEXT NOT NULL,
                activo BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Insertar datos por defecto
        const adminExistente = await db.get("SELECT * FROM usuarios WHERE usuario = 'admin'");
        if (!adminExistente) {
            const hashedPassword = await bcrypt.hash('1234', 10);
            await db.run("INSERT INTO usuarios (usuario, password) VALUES (?, ?)", 
                ['admin', hashedPassword]);
            console.log("✅ Usuario admin creado (admin/1234)");
        }

        const categorias = await db.all("SELECT * FROM categorias");
        if (categorias.length === 0) {
            await db.run("INSERT INTO categorias (nombre, color) VALUES (?, ?)", ['Trabajo', '#2A6DFF']);
            await db.run("INSERT INTO categorias (nombre, color) VALUES (?, ?)", ['Personal', '#28a745']);
            await db.run("INSERT INTO categorias (nombre, color) VALUES (?, ?)", ['Estudio', '#ffc107']);
            await db.run("INSERT INTO categorias (nombre, color) VALUES (?, ?)", ['Reunión', '#dc3545']);
            console.log("✅ Categorías por defecto creadas");
        }

        console.log("✅ Base de datos lista");
        return true;
    } catch (err) {
        console.error("❌ Error en base de datos:", err.message);
        return false;
    }
}

// ========================================
// ENDPOINTS
// ========================================

// Login
app.post("/login", async (req, res) => {
    const { usuario, password } = req.body;
    try {
        const user = await db.get("SELECT * FROM usuarios WHERE usuario = ?", [usuario]);
        if (!user) {
            return res.json({ success: false, message: "Usuario o contraseña incorrectos" });
        }
        const isValid = await bcrypt.compare(password, user.password);
        if (isValid) {
            res.json({ success: true, rol: user.rol || 'admin', usuario: user.usuario });
        } else {
            res.json({ success: false, message: "Usuario o contraseña incorrectos" });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ========================================
// PROYECTOS
// ========================================

app.get("/api/proyectos", async (req, res) => {
    try {
        const proyectos = await db.all("SELECT * FROM proyectos ORDER BY id DESC");
        res.json(proyectos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/proyectos", async (req, res) => {
    const { nombre, descripcion, color, fecha_inicio, fecha_fin } = req.body;
    try {
        const result = await db.run(
            "INSERT INTO proyectos (nombre, descripcion, color, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?, ?)",
            [nombre, descripcion, color, fecha_inicio, fecha_fin]
        );
        res.json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/api/proyectos/:id", async (req, res) => {
    const { nombre, descripcion, color, estado, fecha_inicio, fecha_fin } = req.body;
    try {
        await db.run(
            "UPDATE proyectos SET nombre=?, descripcion=?, color=?, estado=?, fecha_inicio=?, fecha_fin=? WHERE id=?",
            [nombre, descripcion, color, estado, fecha_inicio, fecha_fin, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/proyectos/:id", async (req, res) => {
    try {
        await db.run("DELETE FROM proyectos WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// CATEGORÍAS
// ========================================

app.get("/api/categorias", async (req, res) => {
    try {
        const categorias = await db.all("SELECT * FROM categorias ORDER BY nombre");
        res.json(categorias);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/categorias", async (req, res) => {
    const { nombre, color } = req.body;
    try {
        const result = await db.run("INSERT INTO categorias (nombre, color) VALUES (?, ?)", [nombre, color]);
        res.json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/categorias/:id", async (req, res) => {
    try {
        await db.run("DELETE FROM categorias WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// ACTIVIDADES
// ========================================

app.get("/api/actividades", async (req, res) => {
    const { fecha, proyecto_id } = req.query;
    try {
        let query = `SELECT a.*, p.nombre as proyecto_nombre, c.nombre as categoria_nombre, c.color as categoria_color 
                     FROM actividades a 
                     LEFT JOIN proyectos p ON a.proyecto_id = p.id 
                     LEFT JOIN categorias c ON a.categoria_id = c.id 
                     WHERE 1=1`;
        let params = [];
        
        if (fecha) {
            query += " AND a.fecha = ?";
            params.push(fecha);
        }
        if (proyecto_id) {
            query += " AND a.proyecto_id = ?";
            params.push(proyecto_id);
        }
        query += " ORDER BY a.fecha ASC, a.hora_inicio ASC";
        
        const actividades = await db.all(query, params);
        res.json(actividades);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/actividades", async (req, res) => {
    const { proyecto_id, categoria_id, titulo, descripcion, fecha, hora_inicio, hora_fin, prioridad, responsable } = req.body;
    try {
        const result = await db.run(
            `INSERT INTO actividades (proyecto_id, categoria_id, titulo, descripcion, fecha, hora_inicio, hora_fin, prioridad, responsable) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [proyecto_id, categoria_id, titulo, descripcion, fecha, hora_inicio, hora_fin, prioridad, responsable]
        );
        res.json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/api/actividades/:id", async (req, res) => {
    const { titulo, descripcion, fecha, hora_inicio, hora_fin, prioridad, completado, responsable } = req.body;
    try {
        await db.run(
            `UPDATE actividades SET titulo=?, descripcion=?, fecha=?, hora_inicio=?, hora_fin=?, prioridad=?, completado=?, responsable=? 
             WHERE id=?`,
            [titulo, descripcion, fecha, hora_inicio, hora_fin, prioridad, completado ? 1 : 0, responsable, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/actividades/:id", async (req, res) => {
    try {
        await db.run("DELETE FROM actividades WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// RECURSOS
// ========================================

app.get("/api/recursos", async (req, res) => {
    try {
        const recursos = await db.all("SELECT * FROM recursos ORDER BY nombre");
        res.json(recursos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/recursos", async (req, res) => {
    const { nombre, tipo } = req.body;
    try {
        const result = await db.run("INSERT INTO recursos (nombre, tipo) VALUES (?, ?)", [nombre, tipo]);
        res.json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/api/recursos/:id", async (req, res) => {
    const { nombre, tipo, disponible } = req.body;
    try {
        await db.run(
            "UPDATE recursos SET nombre=?, tipo=?, disponible=? WHERE id=?",
            [nombre, tipo, disponible ? 1 : 0, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/recursos/:id", async (req, res) => {
    try {
        await db.run("DELETE FROM recursos WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// HORARIOS SEMANALES
// ========================================

// Obtener todos los horarios
app.get("/api/horarios", async (req, res) => {
    try {
        const horarios = await db.all("SELECT * FROM horarios ORDER BY dia_semana, hora_inicio");
        res.json(horarios);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Guardar horario
app.post("/api/horarios", async (req, res) => {
    const { persona, ubicacion, dia_semana, hora_inicio, hora_fin } = req.body;
    try {
        const result = await db.run(
            "INSERT INTO horarios (persona, ubicacion, dia_semana, hora_inicio, hora_fin) VALUES (?, ?, ?, ?, ?)",
            [persona, ubicacion, dia_semana, hora_inicio, hora_fin]
        );
        res.json({ success: true, id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar horario
app.put("/api/horarios/:id", async (req, res) => {
    const { persona, ubicacion, dia_semana, hora_inicio, hora_fin, activo } = req.body;
    try {
        await db.run(
            "UPDATE horarios SET persona=?, ubicacion=?, dia_semana=?, hora_inicio=?, hora_fin=?, activo=? WHERE id=?",
            [persona, ubicacion, dia_semana, hora_inicio, hora_fin, activo ? 1 : 0, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar horario
app.delete("/api/horarios/:id", async (req, res) => {
    try {
        await db.run("DELETE FROM horarios WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener horarios para una fecha específica
app.get("/api/horarios/fecha", async (req, res) => {
    const { fecha } = req.query;
    try {
        const fechaObj = new Date(fecha);
        const diaSemana = fechaObj.getDay();
        
        const horarios = await db.all(
            "SELECT * FROM horarios WHERE dia_semana = ? AND activo = 1 ORDER BY hora_inicio",
            [diaSemana]
        );
        res.json(horarios);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// DASHBOARD
// ========================================

app.get("/api/dashboard/metricas", async (req, res) => {
    try {
        const hoy = new Date().toISOString().split('T')[0];
        
        const totalProyectos = await db.get("SELECT COUNT(*) as count FROM proyectos WHERE estado = 'activo'");
        const actividadesHoy = await db.get("SELECT COUNT(*) as count FROM actividades WHERE fecha = ?", [hoy]);
        const actividadesCompletadas = await db.get("SELECT COUNT(*) as count FROM actividades WHERE completado = 1");
        const actividadesPendientes = await db.get("SELECT COUNT(*) as count FROM actividades WHERE completado = 0 AND fecha >= date('now')");
        
        res.json({
            success: true,
            metricas: {
                totalProyectos: totalProyectos?.count || 0,
                actividadesHoy: actividadesHoy?.count || 0,
                actividadesCompletadas: actividadesCompletadas?.count || 0,
                actividadesPendientes: actividadesPendientes?.count || 0
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========================================
// INICIAR SERVIDOR
// ========================================

async function startServer() {
    const dbOk = await initDatabase();
    if (!dbOk) {
        console.log("❌ No se pudo iniciar la base de datos");
        process.exit(1);
    }
    
    app.listen(PORT, () => {
        console.log(`\n🚀 Servidor de Cronogramas corriendo en http://localhost:${PORT}`);
        console.log(`📁 Directorio: ${finalBaseDir}`);
        console.log(`👤 Usuario: admin | Contraseña: 1234\n`);
    });
}

startServer();