FROM node:18-alpine

# Встановлюємо робочу директорію
WORKDIR /usr/src/app

# Копіюємо файли залежностей
COPY package*.json ./

# Встановлюємо лише необхідні для production залежності
RUN npm install --production

# Копіюємо весь вихідний код
COPY . .

# Налаштовуємо права доступу для користувача node
RUN chown -R node:node /usr/src/app
USER node

EXPOSE 3000
CMD ["node", "index.js"]