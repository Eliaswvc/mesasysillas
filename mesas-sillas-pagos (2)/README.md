# Sistema de Gestión de Mesas y Sillas

Node.js + Express + PostgreSQL (Neon) + frontend HTML/CSS/JS. Una sola app: Express sirve `frontend/`.

## Estructura
```
database/schema.sql
backend/ (package.json, .env.example, src/{config,controllers,middleware,routes,services,utils,app.js})
frontend/ (html, css/, js/)
```

## 1. Crear la base en Neon
1. Entra a https://neon.tech y crea un proyecto.
2. En **Connection Details** copia la cadena (`postgresql://...?sslmode=require`).

## 2. Ejecutar schema.sql
En Neon: **SQL Editor** → pega todo `database/schema.sql` → **Run**.
(El script borra y recrea las tablas; incluye datos de prueba, precios y pagos de ejemplo.)

**¿Ya tienes la base creada con la versión anterior?** No la borres: ejecuta solo `database/migracion_precios_pagos.sql` (agrega precios y pagos sin perder datos; se puede correr varias veces).

## 2b. (Opcional) Datos para las gráficas
Ejecuta `database/seed_demo.sql` en Neon para tener historial de 7 días.

## 3. Configurar .env
```
cd backend
cp .env.example .env
```
Edita `.env`:
```
DATABASE_URL=<cadena de Neon>
JWT_SECRET=<texto largo aleatorio>
PORT=10000
NODE_ENV=production
```

## 4. Ejecutar local
```
cd backend
npm install
npm start
```
Abre http://localhost:10000

## 5. GitHub
```
git init
git add .
git commit -m "Sistema de mesas y sillas"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```
`.env` está en `.gitignore`; no se sube.

## 6. Desplegar en Render
1. Render → **New → Web Service** → conecta el repo.
2. **Root Directory:** `backend`
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. **Environment Variables:**
   - `DATABASE_URL` = cadena de Neon
   - `JWT_SECRET` = secreto largo
   - `NODE_ENV` = `production`
   - (`PORT` lo asigna Render)
6. Deploy. Health check: `/health`.

## 7. Probar la API
```
# login
curl -X POST $URL/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Admin123!"}'

# inventario / dashboard
curl $URL/api/inventario -H "Authorization: Bearer TOKEN"
curl $URL/api/dashboard  -H "Authorization: Bearer TOKEN"

# reserva confirmada (admin)
curl -X POST $URL/api/reservas -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"usuario_id":2,"fecha":"2030-01-10","hora_inicio":"08:00","hora_fin":"12:00","mesas":2,"sillas":30,"confirmar":true}'

# préstamo desde reserva
curl -X POST $URL/api/prestamos -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"reserva_id":4,"fecha_prevista_devolucion":"2030-01-12T12:00:00Z"}'

# devolución parcial
curl -X POST $URL/api/devoluciones -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"prestamo_id":4,"mesas":1,"sillas":15}'
```

## Endpoints
| Método | Ruta | Rol |
|---|---|---|
| POST | /api/auth/login, /api/auth/register | público |
| GET | /api/inventario | todos |
| POST/PUT | /api/inventario(/:id) (incluye `precio_unitario`) | ADMIN |
| GET/POST | /api/reservas | todos (USER ve solo las suyas) |
| GET/POST | /api/pagos | todos (USER solo los suyos) |
| POST | /api/reservas/:id/confirmar | ADMIN |
| POST/DELETE | /api/reservas/:id/cancelar, /api/reservas/:id | dueño o ADMIN |
| GET | /api/prestamos(/:id) | todos (USER solo suyos) |
| POST/PUT | /api/prestamos(/:id) | ADMIN |
| GET | /api/devoluciones | todos (USER solo suyas) |
| POST | /api/devoluciones | ADMIN |
| GET | /api/historial | ADMIN |
| GET | /api/dashboard | todos (USER: datos propios) |
| GET/POST/PUT | /api/usuarios | ADMIN |

## Reglas de inventario
- Reserva PENDIENTE no descuenta stock. Al CONFIRMAR: disponible → reservada.
- Cancelar confirmada: reservada → disponible.
- Préstamo desde reserva: reservada → prestada (reserva pasa a FINALIZADA). Préstamo directo: disponible → prestada.
- Devolución (total o parcial): prestada → disponible.
- Todo en transacción con `SELECT … FOR UPDATE`; `CHECK` en PostgreSQL garantiza `total = disponible + reservada + prestada`.
- `movimientos` es inmutable (trigger).

## Usuarios de prueba
| Correo | Contraseña | Rol |
|---|---|---|
| admin@demo.com | Admin123! | ADMIN |
| user1@demo.com | User123! | USER |
| user2@demo.com | User123! | USER |

## Catálogo de reservas (`/catalogo.html`)
Interfaz tipo tienda para reservar: tarjetas con imagen de **Mesa** y **Silla** (con stock en vivo y selector de cantidad), **packs rápidos** (1 mesa + 4/6/8 sillas) y panel "Tu reserva" con fecha, horario y observaciones. Usa los endpoints existentes `GET /api/inventario` y `POST /api/reservas` (USER → queda PENDIENTE; ADMIN puede elegir usuario y confirmar al instante).

**Cambiar las imágenes:** las ilustraciones están en `frontend/img/` (`mesa.svg`, `silla.svg`, `pack-4/6/8.svg`). Para usar fotos reales, guarda `mesa.jpg`, `silla.jpg`, `pack-4.jpg`, `pack-6.jpg`, `pack-8.jpg` en esa misma carpeta; el catálogo las usa automáticamente y, si no existen, cae a los SVG.

## Cuentas, precios y pagos simulados (USD)
- **Crear cuenta:** `/registro.html` (enlace desde el login). Crea siempre rol `USER`. Valida nombre, correo y contraseña (8–72 caracteres con letras y números), rechaza correos duplicados y limita a 10 registros por hora por IP.
- **Precios:** cada recurso tiene `precio_unitario` en USD, **por unidad y por reserva** (demo: mesa $8.00, silla $1.50). El admin lo edita en *Inventario*. El **total lo calcula el servidor** al crear la reserva y el precio queda congelado en cada línea, así que cambiar precios después no altera reservas anteriores.
- **Pagos (`/pagos.html`, botón *Pagar* en Reservas y *Pagar ahora* tras reservar):** es una pasarela **simulada**, no se mueve dinero real. El monto sale siempre de la reserva (el cliente no lo envía).
- **Tarjetas de prueba:** `4242 4242 4242 4242` y `5555 5555 5555 4444` se aprueban; `4000 0000 0000 0002` se rechaza; `4000 0000 0000 9995` falla por fondos insuficientes; `4000 0000 0000 0127` falla por CVV. Cualquier otra tarjeta con número válido (Luhn), vencimiento futuro y CVV de 3 dígitos (4 en AMEX) se aprueba.
- **Reembolso:** al cancelar una reserva pagada se genera automáticamente un reembolso (simulado) por el monto completo.
- **Seguridad de datos:** solo se guarda marca, últimos 4 dígitos y titular. **Nunca** el número completo ni el CVV. La tabla `pagos` es un libro inmutable (un trigger impide editar o borrar filas); los intentos rechazados también quedan registrados.
- **Dashboard:** muestra cobrado, reembolsado, ingresos netos y por cobrar (el usuario ve solo lo suyo).

> Para pagos reales habría que reemplazar `utils/tarjeta.js` (`simularPasarela`) por una pasarela como Stripe, que tokeniza la tarjeta en el navegador para que el servidor nunca la reciba.
