# backend/db.py

import mysql.connector
from mysql.connector import Error

# Configuración básica para conectarse a MySQL (XAMPP).
# Aquí indico host, usuario y el nombre de la base de datos.
DB_CONFIG = {
    "host": "localhost",
    "user": "root",      # usuario típico por defecto en XAMPP
    "password": "",      # si root no tiene contraseña, se deja vacío
    "database": "dhondt" # nombre de la base de datos del proyecto
}


def get_connection():
    """
    Abre y devuelve una conexión a MySQL usando la configuración anterior.
    Si hay algún problema, se imprime el error y se vuelve a lanzar la excepción.
    """
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        return conn
    except Error as e:
        print("Error conectando a MySQL:", e)
        raise
