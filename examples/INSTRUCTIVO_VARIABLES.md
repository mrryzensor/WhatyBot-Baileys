# Instructivo: Uso de Variables en Mensajes

## Formato del Archivo CSV

Tu archivo CSV debe tener la siguiente estructura:

### Encabezados Obligatorios
- **phone**: Número de teléfono con código de país (ej: +5491123456789)
- **name**: Nombre del contacto (opcional pero recomendado)

### Variables Personalizadas
Puedes agregar cualquier columna adicional para usar como variable:
- empresa
- producto  
- fecha_vencimiento
- direccion
- etc.

## Ejemplo de Archivo CSV

```csv
phone,name,empresa,producto,fecha_vencimiento
+5491123456789,Juan Pérez,Tech Solutions,Software CRM,2024-12-31
+5491134567890,María García,Marketing Pro,Servicios SEO,2025-01-15
```

## Cómo Usar las Variables

En el campo del mensaje, usa las variables con doble llave:

```
Hola {{name}}, te saluda {{empresa}}.

Tu producto {{producto}} está por vencer el {{fecha_vencimiento}}.

Contáctanos para renovar.
```

## Variables Especiales

- {{name}}: Nombre del contacto
- {{phone}}: Número de teléfono
- Cualquier encabezado de tu CSV: {{nombre_columna}}

## Tips

1. **No uses espacios** en los nombres de columnas
2. **Usa guiones bajos** en lugar de espacios: `nombre_cliente`
3. **Verifica números** con formato internacional: +código + número
4. **Prueba con pocos contactos** antes de enviar a grandes listas
5. **Guarda copias** de tus archivos CSV originales

## Ejemplos de Mensajes

### Mensaje de Vencimiento
```
Estimado/a {{name}},
Le recordamos que su servicio {{producto}} con {{empresa}} vence el {{fecha_vencimiento}}.
Por favor contacte con nosotros para renovar.
```

### Mensaje de Marketing
```
¡Hola {{name}}!
{{empresa}} tiene una oferta especial para ti en {{producto}}.
No te la pierdas!
```

### Mensaje Personalizado
```
Querido {{name}},
Esperamos que esté disfrutando de {{producto}} de {{empresa}}.
Si necesita ayuda, estamos aquí para asistirle.
```

## Descarga Archivo Ejemplo

Puedes descargar el archivo ejemplo desde: `examples/contactos_ejemplo.csv`
