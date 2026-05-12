const express = require('express')
const fs = require('fs')
const path = require('path')
const app = express()

app.use(express.json())
app.use(express.static(__dirname))

const BOOKINGS_FILE = path.join(__dirname, 'bookings.json')
const SOFTWARE_FILE = path.join(__dirname, 'software.json')

// Ініціалізація файлів якщо не існують
if (!fs.existsSync(BOOKINGS_FILE)) {
	fs.writeFileSync(BOOKINGS_FILE, JSON.stringify([]))
}
if (!fs.existsSync(SOFTWARE_FILE)) {
	fs.writeFileSync(SOFTWARE_FILE, JSON.stringify({
		"68": ["VS Code", "Microsoft Office"],
		"81": ["VS Code", "Microsoft Office"],
		"82": ["VS Code", "Microsoft Office"],
		"83": ["VS Code", "Microsoft Office"],
		"68a": ["VS Code", "Microsoft Office"]
	}, null, 2))
}

// Отримати всі бронювання
app.get('/api/bookings', (req, res) => {
	try {
		const data = fs.readFileSync(BOOKINGS_FILE, 'utf8')
		res.json(JSON.parse(data))
	} catch (error) {
		res.status(500).json({ error: 'Помилка читання даних' })
	}
})

// Зберегти бронювання
app.post('/api/bookings', (req, res) => {
	try {
		fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(req.body, null, 2))
		res.json({ success: true })
	} catch (error) {
		res.status(500).json({ error: 'Помилка збереження даних' })
	}
})

// Отримати ПЗ для всіх аудиторій
app.get('/api/software', (req, res) => {
	try {
		const data = fs.readFileSync(SOFTWARE_FILE, 'utf8')
		res.json(JSON.parse(data))
	} catch (error) {
		res.status(500).json({ error: 'Помилка читання ПЗ' })
	}
})

// Зберегти ПЗ для аудиторії
app.post('/api/software/:room', (req, res) => {
	try {
		const data = JSON.parse(fs.readFileSync(SOFTWARE_FILE, 'utf8'))
		data[req.params.room] = req.body.software
		fs.writeFileSync(SOFTWARE_FILE, JSON.stringify(data, null, 2))
		res.json({ success: true })
	} catch (error) {
		res.status(500).json({ error: 'Помилка збереження ПЗ' })
	}
})

// Головна сторінка
app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'zero.html'))
})

const PORT = 3000
app.listen(PORT, () => {
	console.log(`Сервер запущено на http://localhost:${PORT}`)
})
