# 🐉 D&D Real-time Virtual Tabletop (VTT) & Dice Roller

ระบบจัดการการเล่น D&D แบบ Real-time ผ่าน Web Browser รองรับทั้งการสร้างห้อง DM, ผู้เล่นเข้าร่วมห้อง, ทอยลูกเต๋าพร้อมกัน, ระบบ Initiative Tracker, การจัดการ HP/Mana, สถานะ, ไอเทม และระบบ Save/Load Session เป็นไฟล์ JSON

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```plaintext
DnD/
├── package.json       # รายการ dependencies (Express, Socket.io)
├── server.js          # Backend Server (Node.js + Socket.io)
├── public/
│   ├── index.html     # หน้าจอ Lobby และ Virtual Tabletop
│   ├── style.css      # ธีม Dark Fantasy สไตล์ D&D
│   └── client.js      # ตรรกะ Real-time Sync, ทอยเต๋า, Save/Load
└── .gitignore         # ละเว้น node_modules
```

---

## 🚀 วิธีการติดตั้งและรันใช้งาน (Installation & Quick Start)

### วิธีที่ 1: รันทดสอบในเครื่องตัวเอง (Localhost)

1. เปิด Terminal / PowerShell ในโฟลเดอร์นี้
2. ติดตั้งแพ็กเกจ (Dependencies):
   ```bash
   npm install
   ```
3. สั่งรันเซิร์ฟเวอร์:
   ```bash
   npm start
   ```
4. เปิดเว็บเบราว์เซอร์ไปที่:
   ```text
   http://localhost:3000
   ```

### วิธีที่ 2: นำขึ้นเซิร์ฟเวอร์ออนไลน์ฟรี (Render.com / Railway.app)

1. อัปโหลดโปรเจกต์นี้ขึ้น GitHub Repository
2. เข้าเว็บไซต์ [Render.com](https://render.com) หรือ [Railway.app](https://railway.app)
3. เลือก **New Web Service** และเชื่อมต่อกับ Repository
4. ตั้งค่า:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. เมื่อ Deploy เสร็จ สามารถนำ URL สาธารณะที่ได้ส่งให้เพื่อนในปาร์ตี้เข้าร่วมเล่นได้ทันที

---

## 📖 คู่มือการใช้งาน (User Manual)

### สำหรับ DM (Dungeon Master):
- กด **"สร้างห้อง (Create Room)"** ในหน้า Lobby
- คัดลอก **รหัสห้อง (Room Code)** ส่งให้ผู้เล่น
- ใช้แผงควบคุมด้านขวาเพื่อ **เพิ่มมอนสเตอร์ / NPC**
- กด **เรียงลำดับ (Initiative)** เพื่อจัดลำดับก่อนหลัง
- กด **เทิร์นถัดไป ⏭️** เพื่อวนรอบการต่อสู้
- ปรับค่า HP / Mana, เพิ่ม/ลบสถานะ หรือมอบไอเทมผ่านการ์ดของแต่ละตัวละคร
- กด **💾 Save Game (JSON)** เพื่อเซฟสถานะ และกด **📂 Load Save** เพื่อโหลดเกมกลับมาเล่นต่อ

### สำหรับ Player (ผู้เล่น):
- กรอก **รหัสห้อง**, ชื่อตัวละคร, Max HP และ Max Mana แล้วกด **เข้าห้อง (Join Room)**
- เลือกค่า Modifier (ถ้ามี) แล้วกดทอยลูกเต๋า (d4, d6, d8, d10, d12, d20, d100)
- ผลลัพธ์และบันทึกประวัติการทอยจะแสดงบนหน้าจอของทุกคนในห้องแบบ Real-time

