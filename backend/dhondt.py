# backend/dhondt.py

def dhondt(votos_por_partido, num_escanos):
    """
    Calcula el reparto de escaños usando el método D'Hondt.

    Parámetros:
        votos_por_partido: diccionario {nombre_partido: votos}
        num_escanos: número total de escaños (int)

    Devuelve:
        diccionario {nombre_partido: escaños_asignados}
    """

    # Lista donde guardo todos los cocientes (valor, partido)
    cocientes = []

    # Recorro cada partido y genero sus cocientes votos/1, votos/2, ..., votos/num_escanos
    for partido, votos in votos_por_partido.items():
        for divisor in range(1, num_escanos + 1):
            cociente = votos / divisor
            cocientes.append((cociente, partido))

    # Ordeno todos los cocientes de mayor a menor
    cocientes.sort(reverse=True, key=lambda x: x[0])

    # Me quedo solo con los num_escanos primeros (los más altos)
    cocientes_seleccionados = cocientes[:num_escanos]

    # Inicializo el resultado a 0 escaños para cada partido
    resultado = {partido: 0 for partido in votos_por_partido.keys()}

    # Recorro los cocientes seleccionados y sumo 1 escaño al partido que corresponda
    for _, partido in cocientes_seleccionados:
        resultado[partido] += 1

    # Devuelvo un diccionario con los escaños finales por partido
    return resultado
