const admin = require("firebase-admin");
const express = require("express");
const path = require("path");
const chalk = require("chalk");

// Налаштування Firebase через змінні оточення або файл
let serviceAccount;
const envKey = process.env.FIREBASE_PRIVATE_KEY;

// Перевіряємо, чи ключ дійсно схожий на PEM-формат
if (envKey && envKey.includes("-----BEGIN PRIVATE KEY-----")) {
  serviceAccount = {
    project_id: process.env.FIREBASE_PROJECT_ID,
    // Надійне очищення приватного ключа
    private_key: envKey
      .replace(/\\n/g, '\n') // Заміна тексту \n на справжній перенос рядка
      .replace(/\\r/g, '')   // Видалення можливих \r
      .trim()                // Видалення пробілів з обох кінців
      .replace(/^["']|["']$/g, ''), // Видалення лапок на початку та в кінці
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
  };
} else {
  // Використовуємо абсолютний шлях до файлу в корені проекту
  const configPath = path.resolve(__dirname, "..", "serviceAccountKey.json.json");
  serviceAccount = require(configPath);
}

const app = express();
app.use(express.json());

// --- Middleware для логування кожного запиту ---
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const color = status >= 500 ? chalk.red : status >= 400 ? chalk.yellow : chalk.green;
    
    console.log(
      `${chalk.gray(`[${new Date().toLocaleTimeString()}]`)} ` +
      `${chalk.bold.magenta(req.method)} ${chalk.cyan(req.originalUrl)} ` +
      `${color(status)} ${chalk.gray(`(${duration}ms)`)}`
    );
  });
  next();
});

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || "@kadet.ukr.education";
const db = admin.firestore();

// --- Документація API ---
const apiDocs = `
<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <title>Kadet API Documentation</title>
    <style>
        body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 20px; color: #333; }
        h1 { color: #2c3e50; border-bottom: 2px solid #eee; }
        .endpoint { background: #f9f9f9; padding: 15px; margin-bottom: 20px; border-radius: 8px; border-left: 5px solid #3498db; }
        .method { font-weight: bold; color: #fff; padding: 3px 8px; border-radius: 4px; display: inline-block; margin-right: 10px; }
        .get { background: #61affe; } .post { background: #49cc90; } .patch { background: #fca130; } .delete { background: #f93e3e; }
        code { background: #eee; padding: 2px 5px; border-radius: 4px; font-family: monospace; }
        .role { font-size: 0.9em; color: #7f8c8d; font-style: italic; }
    </style>
</head>
<body>
    <h1>Документація Kadet API</h1>
    <p>Усі запити потребують заголовка <code>Authorization: Bearer &lt;ID_TOKEN&gt;</code></p>
    <p><a href="/login" target="_blank">👉 Отримати токен (вхід через Firebase)</a></p>

    <div class="endpoint">
        <span class="method get">GET</span> <code>/users</code>
        <p class="role">Доступ: admin</p>
        <p>Повертає список усіх користувачів системи.</p>
    </div>

    <div class="endpoint">
        <span class="method patch">PATCH</span> <code>/users/approve/:id</code>
        <p class="role">Доступ: admin</p>
        <p>Змінює роль користувача на "teacher". Використовуйте UID з Firebase як параметр <code>id</code>.</p>
    </div>

    <div class="endpoint">
        <span class="method get">GET</span> <code>/software</code>
        <p class="role">Доступ: admin, teacher</p>
        <p>Отримує список усього зареєстрованого програмного забезпечення.</p>
    </div>

    <div class="endpoint">
        <span class="method post">POST</span> <code>/software</code>
        <p class="role">Доступ: admin</p>
        <p>Додає ПЗ. Тіло запиту: <code>{ "id": "string", "name": "string", "version": "string" }</code></p>
    </div>

    <div class="endpoint">
        <span class="method post">POST</span> <code>/auditory</code>
        <p class="role">Доступ: admin, teacher</p>
        <p>Створює аудиторію. Тіло запиту: <code>{ "roomNumber": "string", "name": "string" }</code></p>
    </div>

    <div class="endpoint">
        <span class="method post">POST</span> <code>/records</code>
        <p class="role">Доступ: admin, teacher</p>
        <p>Створює запис. Тіло запиту: <code>{ "id": "string", "data": "string", "number": "string" }</code></p>
    </div>

    <div class="endpoint">
        <span class="method delete">DELETE</span> <code>/software/:id</code> | <code>/auditory/:id</code> | <code>/records/:id</code>
        <p class="role">Доступ: admin (для ПЗ), admin/teacher (для іншого)</p>
        <p>Видаляє відповідний ресурс за його ідентифікатором.</p>
    </div>

    <footer style="margin-top: 50px; font-size: 0.8em; color: #bdc3c7;">
        Останнє оновлення: ${new Date().toLocaleDateString('uk-UA')}
    </footer>
</body>
</html>
`;

app.get("/docs", (req, res) => {
  res.send(apiDocs);
});

// Middleware для перевірки автентифікації та прав доступу
const checkRole = (allowedRoles) => {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Відсутній або невірний токен авторизації" });
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
      // Верифікація токена через Firebase Admin SDK
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const { uid, email, name } = decodedToken;
      
      console.log(chalk.blue(`[AUTH] Верифікація токена для: ${chalk.bold(email || uid)}`));

      let userDoc = await db.collection('users').doc(uid).get();

      if (!userDoc.exists) {
        if (!email || !email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
          console.log(chalk.red(`[AUTH] Відмовлено: невірний домен ${email}`));
          return res.status(403).json({ error: `Доступ дозволено лише для домену ${ALLOWED_EMAIL_DOMAIN}` });
        }

        // Логіка автоматичного призначення адміна першому користувачу
        const usersSnapshot = await db.collection('users').limit(1).get();
        const isFirstUser = usersSnapshot.empty;

        const userData = {
          uid,
          email,
          fullName: name || "Користувач",
          role: isFirstUser ? "admin" : "pending",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('users').doc(uid).set(userData);
        console.log(chalk.yellow(`[DB] Створено користувача: ${uid} з роллю ${userData.role}`));
        req.user = userData;
      } else {
        req.user = { uid, ...userDoc.data() };
      }

      if (allowedRoles.includes(req.user.role)) {
        console.log(chalk.green(`[AUTH] Доступ дозволено. Роль: ${req.user.role}`));
        next();
      } else {
        console.log(chalk.red(`[AUTH] Доступ заборонено для ролі: ${req.user.role}. Потрібно: ${allowedRoles}`));
        return res.status(403).json({ error: `Ваша роль (${req.user.role}) не має доступу до цього ресурсу` });
      }
    } catch (err) {
      console.error(chalk.bgRed.white(" AUTH ERROR "), chalk.red(err.message));
      return res.status(401).json({ error: "Недійсний токен" });
    }
  };
};

// --- РОБОТА З КОРИСТУВАЧАМИ ---
app.get("/users", checkRole(['admin']), async (req, res) => {
  try {
    const snapshot = await db.collection("users").get();
    const users = snapshot.docs.map(doc => doc.data());
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- ПІДТВЕРДЖЕННЯ РОЛІ (Тільки Адмін) ---
app.patch("/users/approve/:id", checkRole(['admin']), async (req, res) => {
  try {
    await db.collection("users").doc(req.params.id).update({ role: "teacher" });
    console.log(chalk.cyan(`[ADMIN] Роль користувача ${req.params.id} змінена на teacher`));
    res.json({ status: "success" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- SOFTWARE: - Тільки Адмін ---
app.get("/software", checkRole(['admin', 'teacher']), async (req, res) => {
  try {
    const snapshot = await db.collection("software").get();
    const software = snapshot.docs.map(doc => doc.data());
    res.json(software);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/software", checkRole(['admin']), async (req, res) => {
  try {
    const { name, version, id } = req.body;
    if (!id) return res.status(400).json({ error: "Field 'id' is required!" });
    await db.collection("software").doc(id).set({ name, version, id });
    console.log(chalk.green(`[DB] ПЗ додано: ${name} (v${version})`));
    res.status(201).json({ status: "created" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- AUDITORY: (roomNumber, name) - Адмін + Викладач ---
app.post("/auditory", checkRole(['admin', 'teacher']), async (req, res) => {
  try {
    const { roomNumber, name } = req.body;
    const docRef = await db.collection("auditory").add({ roomNumber, name });
    console.log(chalk.green(`[DB] Аудиторію створено: ${roomNumber}`));
    res.status(201).json({ id: docRef.id, status: "created" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- 5. RECORDS: (data, number, id) - Адмін + Викладач ---
app.post("/records", checkRole(['admin', 'teacher']), async (req, res) => {
  try {
    const { data, number, id } = req.body;
    if (!id) return res.status(400).json({ error: "Field 'id' is required!" });
    await db.collection("records").doc(id).set({ data, number, id });
    console.log(chalk.green(`[DB] Запис створено: ID ${id}`));
    res.status(201).json({ status: "created" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- ВИДАЛЕННЯ ---
app.delete("/software/:id", checkRole(['admin']), async (req, res) => {
  await db.collection("software").doc(req.params.id).delete();
  console.log(chalk.red(`[DB] Видалено ПЗ: ${req.params.id}`));
  res.json({ status: "deleted" });
});

app.delete("/auditory/:id", checkRole(['admin', 'teacher']), async (req, res) => {
  await db.collection("auditory").doc(req.params.id).delete();
  console.log(chalk.red(`[DB] Видалено аудиторію: ${req.params.id}`));
  res.json({ status: "deleted" });
});

app.delete("/records/:id", checkRole(['admin', 'teacher']), async (req, res) => {
  await db.collection("records").doc(req.params.id).delete();
  console.log(chalk.red(`[DB] Видалено запис: ${req.params.id}`));
  res.json({ status: "deleted" });
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/", (req, res) => res.redirect("/docs"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(chalk.bold.green(`\n🚀 Сервер успішно запущено на порту ${PORT}!`));
  console.log(chalk.white("Документація доступна тут: ") + chalk.bold.blue(`http://localhost:${PORT}/docs`));
  console.log(chalk.gray("--------------------------------------------------\n"));
});