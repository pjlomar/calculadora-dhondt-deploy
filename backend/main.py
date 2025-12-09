# backend/main.py

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Tuple
from datetime import datetime
import json
import hashlib

# Importo la función que hace el cálculo D'Hondt
from dhondt import dhondt
# Importo la función que abre la conexión con MySQL
from db import get_connection


# ============================================================
# UTILIDADES DE SEGURIDAD (HASH DE CONTRASEÑAS)
# ============================================================

def hash_password(password: str) -> str:
    """
    Devuelve el hash SHA-256 de la contraseña.
    En un proyecto real se usaría bcrypt o similar, pero
    para este proyecto educativo es suficiente.
    """
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    """Comprueba si la contraseña en texto plano coincide con el hash guardado."""
    return hash_password(password) == password_hash


# ============================================================
# MODELOS Pydantic (esquemas de datos de entrada/salida)
# ============================================================

class PartidoEntrada(BaseModel):
    """Modelo para recibir la información básica de cada partido desde el frontend."""
    nombre: str
    votos: int
    color: str | None = None


class PeticionCalculo(BaseModel):
    """Cuerpo de la petición /calcular enviada desde el frontend."""
    num_escanos: int
    votos_blanco: int = 0
    votos_nulos: int = 0
    umbral_porcentaje: float = 0.0
    partidos: List[PartidoEntrada]


class PeticionGuardarSimulacion(BaseModel):
    """
    Cuerpo de la petición para guardar/actualizar simulaciones.
    Incluye el usuario que la guarda y todos los parámetros.
    """
    usuario_id: int
    nombre: str
    num_escanos: int
    votos_blanco: int = 0
    votos_nulos: int = 0
    umbral_porcentaje: float = 0.0
    partidos: List[PartidoEntrada]


class PartidoResultado(BaseModel):
    """Modelo con el resultado final por partido (para la tabla y el hemiciclo)."""
    nombre: str
    votos: int
    escanos: int
    color: str | None = None
    supera_umbral: bool = True


class RespuestaCalculo(BaseModel):
    """Modelo de respuesta que devuelve el backend al hacer un cálculo."""
    num_escanos: int
    votos_blanco: int = 0
    votos_nulos: int = 0
    total_validos: int
    total_emitidos: int
    umbral_porcentaje: float = 0.0
    votos_minimos_umbral: int = 0
    resultado: List[PartidoResultado]


class SimulacionResumen(BaseModel):
    """Modelo sencillo para listar simulaciones (solo cabecera)."""
    id: int
    nombre: str
    fecha: datetime


class SimulacionDetalle(BaseModel):
    """Modelo completo de una simulación, para cargarla de nuevo en la web."""
    id: int
    nombre: str
    num_escanos: int
    votos_blanco: int = 0
    votos_nulos: int = 0
    umbral_porcentaje: float = 0.0
    total_validos: int = 0
    total_emitidos: int = 0
    votos_minimos_umbral: int = 0
    partidos: List[PartidoEntrada]
    resultado: List[PartidoResultado]


class RegistroUsuario(BaseModel):
    """Datos necesarios para registrar un usuario nuevo."""
    username: str
    password: str


class LoginUsuario(BaseModel):
    """Datos necesarios para iniciar sesión."""
    username: str
    password: str


# ============================================================
# FUNCIONES AUXILIARES DE NEGOCIO
# ============================================================

def _validar_nombre_simulacion(nombre: str) -> str:
    """Comprueba que el nombre de la simulación no esté vacío y devuelve la versión recortada."""
    if not nombre or not nombre.strip():
        raise HTTPException(
            status_code=400,
            detail="El nombre de la simulación no puede estar vacío."
        )
    return nombre.strip()


def _comprobar_simulacion_duplicada(usuario_id: int, nombre: str, excluir_id: int | None = None) -> bool:
    """
    Comprueba en la base de datos si ya existe una simulación con ese nombre para ese usuario.
    Si excluir_id tiene valor, excluimos esa fila de la comprobación (útil al actualizar).
    """
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        if excluir_id is None:
            sql = """
                SELECT id
                FROM simulaciones
                WHERE usuario_id = %s AND nombre = %s
            """
            params = (usuario_id, nombre)
        else:
            sql = """
                SELECT id
                FROM simulaciones
                WHERE usuario_id = %s AND nombre = %s AND id != %s
            """
            params = (usuario_id, nombre, excluir_id)

        cursor.execute(sql, params)
        existe = cursor.fetchone() is not None

        cursor.close()
        conn.close()
        return existe

    except Exception:
        # Si algo falla a nivel de BD, devolvemos error genérico de servidor
        raise HTTPException(
            status_code=500,
            detail="Error interno al comprobar duplicados"
        )


def procesar_simulacion(
    num_escanos: int,
    votos_blanco: int,
    votos_nulos: int,
    umbral_porcentaje: float,
    partidos: List[PartidoEntrada],
) -> Tuple[RespuestaCalculo, dict]:
    """
    Función central de negocio:
    - valida los datos
    - calcula totales y umbral
    - aplica el método D'Hondt
    - construye el resultado para el frontend y para la BD
    """

    # -----------------------------
    # Validaciones de parámetros
    # -----------------------------
    if num_escanos < 1:
        raise HTTPException(status_code=400, detail="El número de escaños debe ser al menos 1")

    if votos_blanco < 0 or votos_nulos < 0:
        raise HTTPException(status_code=400, detail="Los votos en blanco y nulos no pueden ser negativos")

    umbral = umbral_porcentaje or 0.0
    if umbral < 0 or umbral > 100:
        raise HTTPException(status_code=400, detail="El umbral debe estar entre 0 y 100")

    if not partidos:
        raise HTTPException(status_code=400, detail="Debe introducirse al menos un partido")

    # Valido cada partido (nombre y votos)
    for p in partidos:
        if not p.nombre.strip():
            raise HTTPException(status_code=400, detail="Todos los partidos deben tener nombre")
        if p.votos < 0:
            raise HTTPException(status_code=400, detail="Los votos de un partido no pueden ser negativos")

    # -----------------------------
    # Cálculo de totales y umbral
    # -----------------------------
    # Diccionario nombre -> votos
    votos_por_partido = {p.nombre: p.votos for p in partidos}

    total_partidos = sum(votos_por_partido.values())
    if total_partidos == 0:
        raise HTTPException(status_code=400, detail="Debe haber al menos un voto para poder hacer el reparto")

    # Votos válidos = partidos + blanco | emitidos = válidos + nulos
    total_validos = total_partidos + votos_blanco
    total_emitidos = total_validos + votos_nulos

    # Umbral en número de votos (si el umbral es 0, no se aplica filtro)
    votos_minimos = int(total_validos * umbral / 100) if umbral > 0 else 0

    # -----------------------------
    # Aplicar umbral (filtro)
    # -----------------------------
    if umbral > 0:
        votos_filtrados = {
            nombre: votos
            for nombre, votos in votos_por_partido.items()
            if votos >= votos_minimos
        }
        # Si ningún partido supera el umbral, no tendría sentido hacer el reparto
        if len(votos_filtrados) == 0:
            raise HTTPException(
                status_code=400,
                detail=f"Ningún partido supera el umbral del {umbral}%. Reduce el umbral o revisa los votos."
            )
    else:
        votos_filtrados = votos_por_partido

    # -----------------------------
    # Reparto D'Hondt
    # -----------------------------
    # Solo se reparte entre los partidos que pasan el umbral
    reparto = dhondt(votos_filtrados, num_escanos)

    lista_resultado: List[PartidoResultado] = []
    for partido in partidos:
        escanos_asignados = reparto.get(partido.nombre, 0)
        supera = partido.votos >= votos_minimos if umbral > 0 else True
        lista_resultado.append(
            PartidoResultado(
                nombre=partido.nombre,
                votos=partido.votos,
                escanos=escanos_asignados,
                color=partido.color,
                supera_umbral=supera,
            )
        )

    # Objeto que se envía al frontend
    respuesta = RespuestaCalculo(
        num_escanos=num_escanos,
        votos_blanco=votos_blanco,
        votos_nulos=votos_nulos,
        total_validos=total_validos,
        total_emitidos=total_emitidos,
        umbral_porcentaje=umbral,
        votos_minimos_umbral=votos_minimos,
        resultado=lista_resultado,
    )

    # Diccionario que se guarda como JSON en la BD
    datos_para_guardar = {
        "num_escanos": num_escanos,
        "votos_blanco": votos_blanco,
        "votos_nulos": votos_nulos,
        "umbral_porcentaje": umbral,
        "votos_minimos_umbral": votos_minimos,
        "total_validos": total_validos,
        "total_emitidos": total_emitidos,
        "partidos": [p.dict() for p in partidos],
        "resultado": [r.dict() for r in lista_resultado],
        "nombre": None,  # se rellena en los endpoints de simulación
    }

    return respuesta, datos_para_guardar


# ============================================================
# CREACIÓN DE LA APLICACIÓN FASTAPI
# ============================================================

app = FastAPI(
    title="API Ley D'Hondt",
    description="Backend para calcular reparto de escaños con el método D'Hondt",
    version="0.1.0"
)

# Configuro CORS para poder llamar a la API desde el frontend (otro puerto)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# ENDPOINTS PRINCIPALES (CÁLCULO)
# ============================================================

@app.get("/")
def leer_raiz():
    """Endpoint básico para comprobar que la API está levantada."""
    return {"mensaje": "API D'Hondt funcionando. Visita /docs para probarla."}


@app.post("/calcular", response_model=RespuestaCalculo)
def calcular_escanos(peticion: PeticionCalculo):
    """
    Recibe los datos de la simulación desde el frontend,
    llama a la función de negocio y devuelve el resultado.
    """
    respuesta, _ = procesar_simulacion(
        num_escanos=peticion.num_escanos,
        votos_blanco=peticion.votos_blanco,
        votos_nulos=peticion.votos_nulos,
        umbral_porcentaje=peticion.umbral_porcentaje,
        partidos=peticion.partidos,
    )
    return respuesta


# ============================================================
# ENDPOINTS DE SIMULACIONES (CRUD básico)
# ============================================================

@app.post("/simulaciones", response_model=RespuestaCalculo)
def guardar_simulacion(peticion: PeticionGuardarSimulacion):
    """
    Guarda una simulación nueva si no existe otra con el mismo nombre
    para el mismo usuario.
    """
    nombre_limpio = _validar_nombre_simulacion(peticion.nombre)

    # Comprobamos si ya hay otra simulación con ese nombre
    if _comprobar_simulacion_duplicada(peticion.usuario_id, nombre_limpio):
        raise HTTPException(
            status_code=400,
            detail="Ya existe una simulación con ese nombre."
        )

    # Reutilizamos la función de negocio para calcular todo
    respuesta, datos_para_guardar = procesar_simulacion(
        num_escanos=peticion.num_escanos,
        votos_blanco=peticion.votos_blanco,
        votos_nulos=peticion.votos_nulos,
        umbral_porcentaje=peticion.umbral_porcentaje,
        partidos=peticion.partidos,
    )

    datos_para_guardar["nombre"] = nombre_limpio

    # Insert en la tabla simulaciones
    try:
        conn = get_connection()
        cursor = conn.cursor()
        sql = """
            INSERT INTO simulaciones (nombre, datos_json, usuario_id)
            VALUES (%s, %s, %s)
        """
        cursor.execute(
            sql,
            (
                nombre_limpio,
                json.dumps(datos_para_guardar, ensure_ascii=False),
                peticion.usuario_id,
            ),
        )
        conn.commit()
        cursor.close()
        conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Error interno al guardar la simulación")

    return respuesta


@app.get("/simulaciones", response_model=List[SimulacionResumen])
def listar_simulaciones(usuario_id: int):
    """Devuelve la lista de simulaciones del usuario (para el listado del frontend)."""
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        sql = """
            SELECT id, nombre, fecha
            FROM simulaciones
            WHERE usuario_id = %s
            ORDER BY fecha DESC
        """
        cursor.execute(sql, (usuario_id,))
        filas = cursor.fetchall()
        cursor.close()
        conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Error interno al listar las simulaciones")

    simulaciones = [SimulacionResumen(**fila) for fila in filas]
    return simulaciones


@app.get("/simulaciones/{sim_id}", response_model=SimulacionDetalle)
def obtener_simulacion(sim_id: int, usuario_id: int):
    """Devuelve el detalle completo de una simulación del usuario."""
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        sql = """
            SELECT id, nombre, datos_json
            FROM simulaciones
            WHERE id = %s
              AND usuario_id = %s
        """
        cursor.execute(sql, (sim_id, usuario_id))
        fila = cursor.fetchone()
        cursor.close()
        conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Error interno al obtener la simulación")

    if fila is None:
        raise HTTPException(status_code=404, detail="Simulación no encontrada o no pertenece al usuario")

    # Cargamos el JSON que guardamos con todos los datos
    datos = json.loads(fila["datos_json"])

    return SimulacionDetalle(
        id=fila["id"],
        nombre=datos.get("nombre", fila["nombre"]),
        num_escanos=datos["num_escanos"],
        votos_blanco=datos.get("votos_blanco", 0),
        votos_nulos=datos.get("votos_nulos", 0),
        umbral_porcentaje=datos.get("umbral_porcentaje", 0.0),
        total_validos=datos.get("total_validos", 0),
        total_emitidos=datos.get("total_emitidos", 0),
        votos_minimos_umbral=datos.get("votos_minimos_umbral", 0),
        partidos=[PartidoEntrada(**p) for p in datos["partidos"]],
        resultado=[PartidoResultado(**r) for r in datos["resultado"]],
    )


@app.put("/simulaciones/{sim_id}", response_model=RespuestaCalculo)
def actualizar_simulacion(sim_id: int, peticion: PeticionGuardarSimulacion):
    """
    Actualiza una simulación existente si pertenece al usuario y
    no hay otra con el mismo nombre.
    """
    nombre_limpio = _validar_nombre_simulacion(peticion.nombre)

    # Comprobamos que no exista otra simulación distinta con el mismo nombre
    if _comprobar_simulacion_duplicada(peticion.usuario_id, nombre_limpio, excluir_id=sim_id):
        raise HTTPException(
            status_code=400,
            detail="Ya existe otra simulación con ese nombre."
        )

    # Volvemos a recalcular la simulación con los nuevos datos
    respuesta, datos_para_guardar = procesar_simulacion(
        num_escanos=peticion.num_escanos,
        votos_blanco=peticion.votos_blanco,
        votos_nulos=peticion.votos_nulos,
        umbral_porcentaje=peticion.umbral_porcentaje,
        partidos=peticion.partidos,
    )

    datos_para_guardar["nombre"] = nombre_limpio

    # UPDATE en la base de datos
    try:
        conn = get_connection()
        cursor = conn.cursor()
        sql = """
            UPDATE simulaciones
            SET nombre = %s,
                datos_json = %s,
                usuario_id = %s
            WHERE id = %s
              AND usuario_id = %s
        """
        cursor.execute(
            sql,
            (
                nombre_limpio,
                json.dumps(datos_para_guardar, ensure_ascii=False),
                peticion.usuario_id,
                sim_id,
                peticion.usuario_id,
            ),
        )
        conn.commit()
        filas_afectadas = cursor.rowcount
        cursor.close()
        conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Error interno al actualizar la simulación")

    if filas_afectadas == 0:
        raise HTTPException(status_code=404, detail="Simulación no encontrada o no pertenece al usuario")

    return respuesta


@app.delete("/simulaciones/{sim_id}")
def eliminar_simulacion(sim_id: int, usuario_id: int):
    """Elimina una simulación del usuario (si realmente es suya)."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        sql = "DELETE FROM simulaciones WHERE id = %s AND usuario_id = %s"
        cursor.execute(sql, (sim_id, usuario_id))
        conn.commit()
        filas_afectadas = cursor.rowcount
        cursor.close()
        conn.close()
    except Exception:
        raise HTTPException(status_code=500, detail="Error interno al eliminar la simulación")

    if filas_afectadas == 0:
        raise HTTPException(status_code=404, detail="Simulación no encontrada o no pertenece al usuario")

    return {"mensaje": "Simulación eliminada correctamente"}


# ============================================================
# REGISTRO Y LOGIN DE USUARIOS
# ============================================================

@app.post("/register")
def registrar_usuario(datos: RegistroUsuario):
    """
    Registro de usuario:
    - nombre de usuario único
    - contraseña mínima de 6 caracteres
      con al menos una mayúscula y un carácter especial.
    """
    password = datos.password or ""

    # Reglas básicas de la contraseña
    if len(password) < 6:
        raise HTTPException(
            status_code=400,
            detail="La contraseña debe tener al menos 6 caracteres."
        )

    if not any(c.isupper() for c in password):
        raise HTTPException(
            status_code=400,
            detail="La contraseña debe incluir al menos una letra mayúscula."
        )

    caracteres_especiales = "!@#$%^&*()_+-=[]{};:,.<>/?|\\"
    if not any(c in caracteres_especiales for c in password):
        raise HTTPException(
            status_code=400,
            detail="La contraseña debe incluir al menos un carácter especial."
        )

    try:
        conn = get_connection()
        cursor = conn.cursor()

        # Comprobamos si el nombre ya existe
        cursor.execute("SELECT id FROM usuarios WHERE username = %s", (datos.username,))
        existe = cursor.fetchone()
        if existe:
            cursor.close()
            conn.close()
            raise HTTPException(
                status_code=400,
                detail="El nombre de usuario ya está registrado"
            )

        # Guardamos el hash, nunca la contraseña en claro
        password_hash = hash_password(password)

        cursor.execute(
            "INSERT INTO usuarios (username, password_hash) VALUES (%s, %s)",
            (datos.username, password_hash)
        )
        conn.commit()
        nuevo_id = cursor.lastrowid

        cursor.close()
        conn.close()

    except HTTPException:
        # Re-lanzar errores controlados (validaciones)
        raise
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Error interno al registrar el usuario"
        )

    return {
        "usuario_id": nuevo_id,
        "username": datos.username
    }


@app.post("/login")
def login(datos: LoginUsuario):
    """Comprueba las credenciales y devuelve el id y el nombre del usuario."""
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            "SELECT id, password_hash FROM usuarios WHERE username = %s",
            (datos.username,)
        )
        fila = cursor.fetchone()
        cursor.close()
        conn.close()
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Error interno al iniciar sesión"
        )

    # Si el usuario no existe o la contraseña no coincide
    if not fila or not verify_password(datos.password, fila["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    return {"usuario_id": fila["id"], "username": datos.username}
