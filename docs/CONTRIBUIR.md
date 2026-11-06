# Cómo contribuir

## Flujo de trabajo

1. Actualiza tu copia: `git checkout main && git pull`.
2. Crea una rama para tu tarea: `git checkout -b feature/nombre-corto` (o `fix/...`, `docs/...`).
3. Haz commits pequeños y con mensaje claro, desde tu propia cuenta de GitHub.
4. Sube la rama: `git push -u origin feature/nombre-corto`.
5. Abre un **pull request** hacia `main` y pide que otro integrante lo revise.
6. Cuando se apruebe, se une a `main` y se borra la rama.

## Mensajes de commit

Formato sugerido: `tipo: descripción corta`.

| Tipo | Uso |
|------|-----|
| `feat` | Funcionalidad nueva |
| `fix` | Corrección de un error |
| `docs` | Cambios en la documentación |
| `refactor` | Reorganización sin cambiar el comportamiento |

Ejemplo: `feat: alerta de stock bajo en el inventario`.

## Reglas

- Nunca subas `node_modules/`, `.wwebjs_auth/` ni contraseñas reales.
- Antes de subir, arranca el servidor (`npm start`) y comprueba que la caja y la cocina cargan.
- No trabajes directamente sobre `main`.
