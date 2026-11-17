# D&D Real-time Virtual Tabletop (VTT) & 3D Dice Roller

เว็บแอปพลิเคชันระบบกระดานเสมือนจำลองสำหรับเล่น D&D แบบ Real-time ผ่าน Web Browser รองรับธีม Dark Fantasy สไตล์ Baldur's Gate 3 / D&D Beyond เต็มรูปแบบ พร้อมระบบล็อกอินสร้างตัวละคร ทอยเต๋า 3 มิติ และระบบจัดการการต่อสู้สำหรับ Dungeon Master

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

---

## ฟีเจอร์เด่นสำหรับ D&D (D&D Mechanics & Features)

1. **ระบบบัญชีตั้งต้น (Default Accounts):**
   - **Dungeon Master (DM):** Username: `dm` / Password: `1234`
   - **Player (น้องเป็ดไวกิ้ง):** Username: `player1` / Password: `1234`
   - หรือกดแท็บ **"สร้างบัญชีใหม่ (Register)"** เพื่อสร้างตัวละครของตัวเองได้ไม่จำกัด

2. **Dungeon Master Screen (ฉากกั้นของ DM - GM เห็นข้อมูลทั้งหมด):**
   - DM มีปุ่ม **"DM Screen"** ที่แถบเมนูด้านบน เพื่อเปิดตารางสรุปข้อมูลของทุกคนในห้อง:
     - ชื่อ, เผ่า, อาชีพ, HP/Max HP (แถบสีเตือนสถานะเลือด), SP/Max SP
     - **AC (Armor Class)** และ **Passive Perception** (10 + WIS mod)
     - ค่าพลัง 6 ด้าน (STR, DEX, CON, INT, WIS, CHA) พร้อม Modifier (+/-)
     - อาวุธ, เกราะ, สกิล, อัลติ และกระเป๋าไอเทม
     - ข้อมูลมอนสเตอร์ทั้งหมด พร้อมค่า HP จริง (แม้ซ่อนจากผู้เล่น)
     - ปุ่มกดดู/แก้ไขข้อมูลของตัวละครนั้นๆ ได้ทันที

3. **ระบบกลไก D&D 5e แท้ (True D&D 5e Rules):**
   - **Advantage & Disadvantage Roller:** เลือกทอยแบบปกติ (Normal), ได้เปรียบ (Advantage - ทอย 2 ลูกเลือกค่าสูงสุด), หรือเสียเปรียบ (Disadvantage - ทอย 2 ลูกเลือกค่าต่ำสุด)
   - **D&D Quick Checks:** ปุ่มลัดทอย Attack, Ability Checks (STR, DEX, CON, INT, WIS, CHA) และ Death Save
   - **Armor Class (AC) & Speed:** แสดงค่า AC บนการ์ดตัวละครและมอนสเตอร์ทุกตัวในสมรภูมิ
   - **Death Saving Throws:** เมื่อ HP ลดเหลือ 0 จะปรากฏระบบทอยเซฟความตาย (Success 3 ครั้ง / Fail 3 ครั้ง)
   - **D&D 5e Status Conditions:** เมนูดรอปดาวน์เลือกสถานะทางการทั้ง 14 แบบ เช่น *Blinded, Charmed, Frightened, Grappled, Invisible, Paralyzed, Poisoned, Prone, Stunned, Unconscious, Exhaustion*
   - **Short Rest & Long Rest:** DM สามารถสั่งพักสั้น (+30% HP/SP) หรือพักยาว (ฟื้นฟู 100% เต็ม) ได้ด้วยคลิกเดียว

4. **ระบบทอยลูกเต๋า 3 มิติ (3D Dice Roller) & ระบบ Event:**
   - ทอยลูกเต๋า 3D พร้อมเสียงสังเคราะห์ (Web Audio API)
   - เอฟเฟกต์ Natural 20 (Critical Success แสงสีทอง) และ Natural 1 (Critical Fail แสงสีแดง)
   - ในช่วงต่อสู้ ล็อคไม่ให้ทอยถ้ายังไม่ถึงเทิร์น แต่ DM สามารถสร้าง **Event** (เช่น ต่อรอง, หลบกับดัก) เพื่อให้ทุกคนทอยพร้อมกันได้

5. **ระบบซ่อน/เปิดเผย HP มอนสเตอร์:**
   - DM ควบคุมได้ว่าจะเปิดเผย (Reveal) หรือซ่อน (Hide) หลอดเลือดของมอนสเตอร์ตัวใด

---

## วิธีติดตั้งและรันใช้งาน (Installation & Deployment)

### 1. ใช้งานผ่านลิงก์ออนไลน์ทันที (Instant Live Link)
- เข้าเล่นได้ทันทีผ่าน Tunnel: **https://social-trains-agree.loca.lt**
*(หากมีหน้าแจ้งเตือน Password ให้กรอก IP โฮสต์: `184.82.86.73`)*

### 2. นำขึ้น Cloud Hosting ฟรี (Render.com / Railway.app)
- โปรเจกต์มีไฟล์ `render.yaml` และ `Dockerfile` รองรับแล้ว
- เข้าที่ [Render.com](https://render.com) หรือ [Railway.app](https://railway.app)
- เชื่อมต่อกับ GitHub Repo: `https://github.com/bio-chan/dnd-realtime-vtt`
- สั่ง Deploy ได้ทันทีโดยไม่ต้องตั้งค่าเพิ่มเติม

### 3. รันในเครื่อง (Localhost)
```bash
npm install
npm start
```
เปิดเบราว์เซอร์ไปที่: `http://localhost:3000`
