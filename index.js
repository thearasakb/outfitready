const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const db = require("./db");

const app = express();
const PORT = 3000;

// 1. ตรวจสอบและสร้างโฟลเดอร์ uploads อัตโนมัติหากยังไม่มี
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// เปิดให้เข้าถึงโฟลเดอร์รูปภาพ static
app.use("/uploads", express.static(uploadDir));

// ตั้งค่า Multer สำหรับอัปโหลดรูปภาพ
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// Home Route
app.get("/", (req, res) => {
  res.send("สวัสดีค่ะ Server OutfitReady ทำงานแล้ว!");
});

// ==========================================
// AUTH ROUTES (Register & Login แบบธรรมดา)
// ==========================================

// POST: สมัครสมาชิก
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const allowedGenders = ["male", "female", "unspecified"];
    const gender = allowedGenders.includes(req.body.gender)
      ? req.body.gender
      : "unspecified";

    if (!username || !password) {
      return res.status(400).json({ message: "กรุณากรอก Username และ Password" });
    }

    const [existing] = await db.query(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: "Username นี้ถูกใช้งานแล้ว" });
    }

    const [result] = await db.query(
      "INSERT INTO users (username, password, gender) VALUES (?, ?, ?)",
      [username, password, gender]
    );

    res.status(201).json({
      message: "สมัครสมาชิกสำเร็จ",
      userId: result.insertId,
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST: เข้าสู่ระบบ
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "กรุณากรอก Username และ Password" });
    }

    const [users] = await db.query(
      "SELECT * FROM users WHERE username = ? AND password = ?",
      [username, password]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: "Username หรือ Password ไม่ถูกต้อง" });
    }

    const user = users[0];

    res.json({
      message: "เข้าสู่ระบบสำเร็จ",
      user: {
        id: user.id,
        username: user.username,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// CLOTHES ROUTES (CRUD Operations)
// ==========================================

// GET: ดึงรายการเสื้อผ้า (รองรับการกรองตาม ?user_id=...)
app.get(["/api/outfit", "/api/clothes"], async (req, res) => {
  try {
    const { user_id } = req.query;
    let query = "SELECT * FROM clothes";
    let params = [];

    if (user_id) {
      query += " WHERE user_id = ?";
      params.push(user_id);
    }

    query += " ORDER BY id DESC";

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: ดึงรายละเอียดเสื้อผ้าเฉพาะชิ้นตาม id
app.get("/api/clothes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query("SELECT * FROM clothes WHERE id = ?", [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "ไม่พบข้อมูลเสื้อผ้าชิ้นนี้" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Error fetching item detail:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST: เพิ่มเสื้อผ้าใหม่ + อัปโหลดรูปภาพ
app.post("/api/clothes", upload.single("image"), async (req, res) => {
  try {
    const { user_id, name, category, description } = req.body;
    const image_url = req.file ? req.file.filename : null;

    if (!image_url) {
      return res.status(400).json({ message: "กรุณาอัปโหลดรูปภาพ" });
    }

    const safeName = name && name.trim() !== "" ? name : "เสื้อผ้าไม่มีชื่อ";
    const safeCategory = category || "shirt";
    const safeDescription = description && description.trim() !== "" ? description : null;

    const [result] = await db.query(
      "INSERT INTO clothes (user_id, name, category, description, image_url) VALUES (?, ?, ?, ?, ?)",
      [user_id || 1, safeName, safeCategory, safeDescription, image_url]
    );

    res.status(201).json({
      message: "เพิ่มเสื้อผ้าสำเร็จ",
      id: result.insertId,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message });
  }
});

// PUT: แก้ไขข้อมูลเสื้อผ้าตาม id
app.put("/api/clothes/:id", upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, description } = req.body;

    const [existing] = await db.query("SELECT * FROM clothes WHERE id = ?", [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: "ไม่พบข้อมูลเสื้อผ้าที่ต้องการแก้ไข" });
    }

    const oldImage = existing[0].image_url;
    let image_url = oldImage;

    if (req.file) {
      image_url = req.file.filename;

      if (oldImage) {
        const oldFilePath = path.join(__dirname, "uploads", oldImage);
        fs.unlink(oldFilePath, (err) => {
          if (err) console.error("ลบรูปเก่าไม่สำเร็จ:", err.message);
        });
      }
    }

    const safeDescription =
      description !== undefined
        ? description.trim() !== ""
          ? description
          : null
        : existing[0].description;

    await db.query(
      "UPDATE clothes SET name = ?, category = ?, description = ?, image_url = ? WHERE id = ?",
      [name || existing[0].name, category || existing[0].category, safeDescription, image_url, id]
    );

    res.json({ message: "แก้ไขข้อมูลเสื้อผ้าสำเร็จ" });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE: ลบเสื้อผ้าตาม id + ลบไฟล์รูปภาพ
app.delete("/api/clothes/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query("SELECT image_url FROM clothes WHERE id = ?", [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "ไม่พบข้อมูลที่ต้องการลบ" });
    }

    const imageName = rows[0].image_url;
    const [result] = await db.query("DELETE FROM clothes WHERE id = ?", [id]);

    if (result.affectedRows > 0 && imageName) {
      const filePath = path.join(__dirname, "uploads", imageName);
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error("ไม่สามารถลบไฟล์รูปภาพได้:", err.message);
        } else {
          console.log(`ลบไฟล์รูปภาพสำเร็จ: ${imageName}`);
        }
      });
    }

    res.json({ message: "ลบเสื้อผ้าและรูปภาพเรียบร้อยแล้ว" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server กำลังทำงานที่ http://localhost:${PORT}`);
});