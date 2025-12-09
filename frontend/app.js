// =========================
// CONFIG GLOBAL DEL PROYECTO
// =========================

// URL base de la API (FastAPI)
const API_URL = "http://127.0.0.1:8000";
// Color por defecto para los partidos si no se elige ninguno
const DEFAULT_PARTY_COLOR = "#1f979a";

// Aquí guardo la instancia del gráfico de hemiciclo (Chart.js)
let hemicicloChart = null;

// Datos que usa el pactómetro (resultado y número total de escaños)
let pactometroDatos = {
    resultado: [],
    numEscanos: 0
};

// Helper genérico para peticiones al backend
// Centralizo aquí el fetch, la lectura de JSON y el manejo de errores.
async function apiFetchJSON(url, options = {}, defaultErrorMessage = "Error en la petición.") {
    try {
        const resp = await fetch(url, options);

        if (!resp.ok) {
            let msg = defaultErrorMessage;
            try {
                const err = await resp.json();
                if (err && err.detail) msg = err.detail;
            } catch (_) { }

            throw new Error(msg);
        }

        return await resp.json();
    } catch (error) {
        console.error("Error en fetch:", error);
        alert(error.message || defaultErrorMessage);
        return null;
    }
}



// =========================
// CÁLCULO PRINCIPAL
// =========================

// Llama al backend /calcular con los datos del formulario
async function calcular() {

    // Primero valido el formulario y obtengo los datos
    const datos = obtenerYValidarDatosFormulario({ exigirNombre: false });
    if (!datos) return;

    const {
        numEscanos,
        votosBlanco,
        votosNulos,
        umbralValor,
        partidos
    } = datos;

    // Envío la petición POST al backend
    const resultadoJson = await apiFetchJSON(
        `${API_URL}/calcular`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                num_escanos: numEscanos,
                votos_blanco: votosBlanco,
                votos_nulos: votosNulos,
                umbral_porcentaje: umbralValor,
                partidos: partidos
            })
        },
        "Error al calcular el reparto de escaños."
    );

    if (!resultadoJson) return;
    // Pinto la tabla, el resumen, el hemiciclo y el pactómetro
    mostrarResultado(resultadoJson);
}



// =========================
// GUARDAR / SOBRESCRIBIR SIMULACIONES
// =========================

// Guarda una simulación nueva o sobrescribe si el nombre ya existe
async function guardarSimulacion() {

    const usuarioIdStr = localStorage.getItem("usuario_id");
    if (!usuarioIdStr) {
        alert("Debes iniciar sesión antes de guardar simulaciones.");
        return;
    }
    const usuario_id = parseInt(usuarioIdStr, 10);

    // Valido datos y exijo que haya nombre de simulación
    const datos = obtenerYValidarDatosFormulario({ exigirNombre: true });
    if (!datos) return;

    const {
        nombre,
        numEscanos,
        votosBlanco,
        votosNulos,
        umbralValor,
        partidos
    } = datos;

    // 1. Comprobar si ya existe simulación con ese nombre
    const simExistente = await buscarSimulacionPorNombre(nombre);

    if (simExistente) {
        const confirmar = confirm(
            `Ya existe una simulación llamada "${nombre}".\n¿Quieres sobrescribirla?`
        );

        if (!confirmar) return;

        // UPDATE (PUT) si el usuario acepta
        const respuestaUpdate = await apiFetchJSON(
            `${API_URL}/simulaciones/${simExistente.id}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    usuario_id: usuario_id,
                    nombre: nombre,
                    num_escanos: numEscanos,
                    votos_blanco: votosBlanco,
                    votos_nulos: votosNulos,
                    umbral_porcentaje: umbralValor,
                    partidos: partidos
                })
            },
            "Error al sobrescribir la simulación."
        );

        if (!respuestaUpdate) return;

        alert("Simulación sobrescrita correctamente.");
        return;
    }

    // 2. Crear nueva (POST) si el nombre no existe
    const respuesta = await apiFetchJSON(
        `${API_URL}/simulaciones`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                usuario_id: usuario_id,
                nombre: nombre,
                num_escanos: numEscanos,
                votos_blanco: votosBlanco,
                votos_nulos: votosNulos,
                umbral_porcentaje: umbralValor,
                partidos: partidos
            })
        },
        "Error al guardar la simulación."
    );

    if (!respuesta) return;

    alert("Simulación guardada correctamente.");
}



// =========================
// CONSULTAS DE SIMULACIONES
// =========================

// Busca en la lista de simulaciones del usuario una por nombre exacto
async function buscarSimulacionPorNombre(nombre) {
    const usuarioId = localStorage.getItem("usuario_id");
    if (!usuarioId) return null;

    try {
        const respuesta = await fetch(
            `${API_URL}/simulaciones?usuario_id=${usuarioId}`
        );

        if (!respuesta.ok) return null;

        const lista = await respuesta.json();
        const lower = nombre.trim().toLowerCase();

        return lista.find(sim => (sim.nombre || "").trim().toLowerCase() === lower) || null;
    } catch (error) {
        console.error("Error buscando simulación:", error);
        return null;
    }
}

// Carga el listado de simulaciones y pinta la tabla + buscador
async function listarSimulaciones() {
    const usuarioIdStr = localStorage.getItem("usuario_id");
    if (!usuarioIdStr) {
        alert("Debes iniciar sesión para ver tus simulaciones.");
        return;
    }

    const usuario_id = parseInt(usuarioIdStr, 10);
    const listaDiv = document.getElementById("lista_simulaciones");

    listaDiv.innerHTML = "<p>Cargando simulaciones...</p>";

    const simulaciones = await apiFetchJSON(
        `${API_URL}/simulaciones?usuario_id=${usuario_id}`,
        {},
        "Error al cargar simulaciones."
    );

    if (!simulaciones) {
        listaDiv.innerHTML =
            "<p class='text-danger'>Error al cargar simulaciones.</p>";
        return;
    }

    if (simulaciones.length === 0) {
        listaDiv.innerHTML =
            "<p class='text-muted'>No hay simulaciones guardadas.</p>";
        return;
    }

    // HTML de la tabla + buscador
    let html = `
        <div class="row mb-2">
            <div class="col-sm-6 col-md-4">
                <input id="buscador_simulaciones" type="text"
                    class="form-control form-control-sm"
                    placeholder="Buscar por nombre...">
            </div>
        </div>
        <div class="table-responsive">
        <table class="table table-bordered table-sm align-middle" id="tabla_simulaciones">
            <thead>
                <tr>
                    <th>Nombre</th>
                    <th>Fecha</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody>
    `;

    simulaciones.forEach(sim => {
        const fechaCorta = (sim.fecha || "").split("T")[0];
        html += `
            <tr>
                <td>${sim.nombre}</td>
                <td>${fechaCorta}</td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-brand" onclick="cargarSimulacion(${sim.id})">Cargar</button>
                        <button class="btn btn-outline-danger" onclick="eliminarSimulacion(${sim.id})">Borrar</button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += "</tbody></table></div>";
    listaDiv.innerHTML = html;

    // Buscador por nombre en la tabla
    const buscador = document.getElementById("buscador_simulaciones");
    const tabla = document.getElementById("tabla_simulaciones");

    buscador.addEventListener("input", () => {
        const termino = buscador.value.trim().toLowerCase();
        tabla.querySelectorAll("tbody tr").forEach(tr => {
            const nombre = tr.children[0].textContent.toLowerCase();
            tr.style.display = nombre.includes(termino) ? "" : "none";
        });
    });
}

// Abre o cierra el bloque de simulaciones
function toggleSimulaciones() {
    const listaDiv = document.getElementById("lista_simulaciones");
    const boton = document.getElementById("btn_ver_simulaciones");

    if (!listaDiv || !boton) return;

    const visible = listaDiv.dataset.visible === "1";

    if (visible) {
        // Ocultar simulaciones
        listaDiv.innerHTML = "";
        listaDiv.dataset.visible = "0";
        boton.textContent = "Ver simulaciones guardadas";
        return;
    }

    // Cargar simulaciones y marcar el estado como visible
    listarSimulaciones();
    listaDiv.dataset.visible = "1";
    boton.textContent = "Ocultar simulaciones";
}

// Carga en pantalla una simulación concreta (por id)
async function cargarSimulacion(id) {
    limpiarErroresValidacion();

    const usuarioIdStr = localStorage.getItem("usuario_id");
    if (!usuarioIdStr) {
        alert("Debes iniciar sesión para cargar simulaciones.");
        return;
    }
    const usuario_id = parseInt(usuarioIdStr, 10);

    const sim = await apiFetchJSON(
        `${API_URL}/simulaciones/${id}?usuario_id=${usuario_id}`,
        {},
        "No se pudo cargar la simulación (puede que no exista o no sea tuya)."
    );

    if (!sim) return;

    // Campos superiores del formulario
    const inputNombre = document.getElementById("nombre_simulacion");
    const inputEscanos = document.getElementById("num_escanos");
    const inputBlanco = document.getElementById("votos_blanco");
    const inputNulos = document.getElementById("votos_nulos");
    const inputUmbral = document.getElementById("umbral");

    if (inputNombre) inputNombre.value = sim.nombre ?? "";
    if (inputEscanos) inputEscanos.value = sim.num_escanos ?? 0;
    if (inputBlanco) inputBlanco.value = sim.votos_blanco ?? 0;
    if (inputNulos) inputNulos.value = sim.votos_nulos ?? 0;
    if (inputUmbral) inputUmbral.value = sim.umbral_porcentaje ?? 0;

    // Tabla de partidos
    const tbody = document.getElementById("tbody_partidos");
    if (tbody) {
        tbody.innerHTML = "";

        if (Array.isArray(sim.partidos) && sim.partidos.length > 0) {
            sim.partidos.forEach(p => {
                addPartidoRow(p.nombre, p.votos, p.color || DEFAULT_PARTY_COLOR);
            });
        } else {
            // Si por cualquier motivo no hay partidos, añado 1 vacío
            addPartidoRow("", "", DEFAULT_PARTY_COLOR);
        }
    }

    // Muestro también el resultado asociado a esa simulación
    mostrarResultado(sim);
}

// Elimina una simulación con confirmación
async function eliminarSimulacion(id) {
    const usuarioIdStr = localStorage.getItem("usuario_id");
    if (!usuarioIdStr) {
        alert("Debes iniciar sesión para borrar simulaciones.");
        return;
    }
    const usuario_id = parseInt(usuarioIdStr, 10);

    const confirmar = confirm("¿Seguro que quieres borrar esta simulación?");
    if (!confirmar) return;

    const resp = await apiFetchJSON(
        `${API_URL}/simulaciones/${id}?usuario_id=${usuario_id}`,
        { method: "DELETE" },
        "No se pudo borrar la simulación (puede que no exista o no sea tuya)."
    );

    if (!resp) return;

    alert("Simulación eliminada correctamente.");
    listarSimulaciones();
}



// =========================
// GESTIÓN DE PARTIDOS (TABLA)
// =========================

// Añade una fila nueva a la tabla de partidos
function addPartidoRow(nombre = "", votos = "", color = DEFAULT_PARTY_COLOR) {
    const tbody = document.getElementById("tbody_partidos");

    if (!tbody) {
        console.error("No se ha encontrado <tbody id='tbody_partidos'>");
        return;
    }

    const tr = document.createElement("tr");

    tr.innerHTML = `
        <td><input type="text" class="form-control" value="${nombre}"></td>
        <td><input type="number" class="form-control" value="${votos}"></td>
        <td><input type="color" class="form-control form-control-color" value="${color}"></td>
    `;

    tbody.appendChild(tr);
}

// Borra la última fila de la tabla de partidos (siempre deja al menos una)
function removeLastPartidoRow() {
    const tbody = document.getElementById("tbody_partidos");
    if (!tbody) return;

    const filas = tbody.getElementsByTagName("tr");

    if (filas.length <= 1) {
        alert("Debe haber al menos un partido en la tabla.");
        return;
    }

    tbody.removeChild(filas[filas.length - 1]);
}



// =========================
// VALIDACIONES FRONTEND (UX)
// =========================

// Borra todas las marcas de error (clase is-invalid)
function limpiarErroresValidacion() {
    document.querySelectorAll("input.is-invalid").forEach(input => {
        input.classList.remove("is-invalid");
    });
}

/**
 * validarInputIndividual
 * - modo normal (soloLimpiar = false): añade o quita rojo según el valor (para blur)
 * - soloLimpiar = true: solo quita el rojo si el valor pasa a ser válido (para input)
 */
function validarInputIndividual(input, { soloLimpiar = false } = {}) {
    const id = input.id;

    // ---- Campos principales de la parte superior ----
    if (id === "num_escanos") {
        const v = parseInt(input.value);
        if (soloLimpiar) {
            if (!isNaN(v) && v >= 1) input.classList.remove("is-invalid");
        } else {
            if (isNaN(v) || v < 1) input.classList.add("is-invalid");
            else input.classList.remove("is-invalid");
        }
        return;
    }

    if (id === "votos_blanco" || id === "votos_nulos") {
        const v = parseInt(input.value);
        if (soloLimpiar) {
            if (!isNaN(v) && v >= 0) input.classList.remove("is-invalid");
        } else {
            if (isNaN(v) || v < 0) input.classList.add("is-invalid");
            else input.classList.remove("is-invalid");
        }
        return;
    }

    if (id === "umbral") {
        const v = parseFloat(input.value);
        if (soloLimpiar) {
            if (!isNaN(v) && v >= 0 && v <= 100) input.classList.remove("is-invalid");
        } else {
            if (isNaN(v) || v < 0 || v > 100) input.classList.add("is-invalid");
            else input.classList.remove("is-invalid");
        }
        return;
    }

    // ---- Validación de partidos (tabla) ----
    // Aquí reviso nombres vacíos, votos negativos y nombres duplicados
    if (input.closest("#tbody_partidos")) {
        const filas = Array.from(document.querySelectorAll("#tbody_partidos tr"));
        const nombres = [];

        filas.forEach(tr => {
            const tds = tr.getElementsByTagName("td");
            const inpNombre = tds[0].querySelector("input");
            const inpVotos = tds[1].querySelector("input");

            const nombre = inpNombre.value.trim();
            const votos = parseInt(inpVotos.value);

            let validoNombre = true;
            let validoVotos = true;

            if (!nombre) validoNombre = false;
            if (isNaN(votos) || votos < 0) validoVotos = false;

            // Si el nombre ya se ha usado en otra fila, lo marco también
            if (nombres.includes(nombre.toLowerCase()) && nombre) {
                validoNombre = false;
            }

            nombres.push(nombre.toLowerCase());

            if (soloLimpiar) {
                if (validoNombre) inpNombre.classList.remove("is-invalid");
                if (validoVotos) inpVotos.classList.remove("is-invalid");
            } else {
                inpNombre.classList.toggle("is-invalid", !validoNombre);
                inpVotos.classList.toggle("is-invalid", !validoVotos);
            }
        });
    }
}

// Lee la tabla de partidos y marca en rojo los errores detectados.
// Si hay algún error, devuelve [].
function leerYValidarPartidosDesdeTabla() {
    const tbody = document.getElementById("tbody_partidos");
    if (!tbody) return [];

    const filas = tbody.getElementsByTagName("tr");
    const partidos = [];
    const nombresUsados = new Set();

    let hayError = false;

    for (let i = 0; i < filas.length; i++) {
        const celdas = filas[i].getElementsByTagName("td");
        const inputNombre = celdas[0].getElementsByTagName("input")[0];
        const inputVotos = celdas[1].getElementsByTagName("input")[0];
        const inputColor = celdas[2].getElementsByTagName("input")[0];

        const nombre = (inputNombre.value || "").trim();
        const votos = parseInt(inputVotos.value);

        let filaCorrecta = true;

        // Nombre obligatorio
        if (nombre === "") {
            inputNombre.classList.add("is-invalid");
            filaCorrecta = false;
        }

        // Votos >= 0
        if (isNaN(votos) || votos < 0) {
            inputVotos.classList.add("is-invalid");
            filaCorrecta = false;
        }

        // Evitar nombres de partido duplicados (mismo nombre dos veces)
        const nombreClave = nombre.toLowerCase();
        if (filaCorrecta) {
            if (nombresUsados.has(nombreClave)) {
                inputNombre.classList.add("is-invalid");
                filaCorrecta = false;
            } else {
                nombresUsados.add(nombreClave);
            }
        }

        // Solo añado el partido al array si la fila es correcta
        if (filaCorrecta) {
            partidos.push({
                nombre: nombre,
                votos: votos,
                color: inputColor ? inputColor.value : DEFAULT_PARTY_COLOR
            });
        } else {
            hayError = true;
        }
    }

    return hayError ? [] : partidos;
}



// =========================
// PACTÓMETRO Y HEMICICLO
// =========================

// Prepara toda la parte del pactómetro (checkboxes y barra)
function prepararPactometro(resultado, numEscanos) {
    pactometroDatos.resultado = resultado || [];
    pactometroDatos.numEscanos = numEscanos || 0;

    const cont = document.getElementById("pacto_partidos");
    if (!cont) return;

    cont.innerHTML = "";

    // Por cada partido con escaños, creo un checkbox
    pactometroDatos.resultado.forEach((p, idx) => {
        if (!p.escanos || p.escanos <= 0) return;

        const wrapper = document.createElement("div");
        wrapper.className = "form-check form-check-inline";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "form-check-input";
        checkbox.id = "pacto_partido_" + idx;
        checkbox.dataset.escanos = p.escanos;
        checkbox.dataset.color = p.color || DEFAULT_PARTY_COLOR;

        const label = document.createElement("label");
        label.className = "form-check-label";
        label.htmlFor = checkbox.id;
        label.textContent = `${p.nombre} (${p.escanos})`;

        // Pequeño circulito con el color del partido
        const colorDot = document.createElement("span");
        colorDot.style.display = "inline-block";
        colorDot.style.width = "12px";
        colorDot.style.height = "12px";
        colorDot.style.borderRadius = "50%";
        colorDot.style.marginLeft = "6px";
        colorDot.style.border = "1px solid #ccc";
        colorDot.style.backgroundColor = p.color || DEFAULT_PARTY_COLOR;
        label.appendChild(colorDot);

        checkbox.addEventListener("change", actualizarPactometro);

        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        cont.appendChild(wrapper);
    });

    // Inicializo el pactómetro en estado "todo desmarcado"
    actualizarPactometro();
}

// Calcula cuántos escaños suma el pacto actual y actualiza la barra
function actualizarPactometro() {
    const numEscanos = pactometroDatos.numEscanos;
    if (!numEscanos) return;

    const checkboxes = document.querySelectorAll(
        "#pacto_partidos input[type='checkbox']"
    );

    let escanosPacto = 0;
    const partidosSeleccionados = [];

    // Recorro los checks marcados y sumo escaños
    checkboxes.forEach(cb => {
        const esc = parseInt(cb.dataset.escanos || "0", 10);
        const color = cb.dataset.color || DEFAULT_PARTY_COLOR;

        if (cb.checked && !isNaN(esc) && esc > 0) {
            escanosPacto += esc;
            partidosSeleccionados.push({ escanos: esc, color });
        }
    });

    // Porcentaje de escaños que representa el pacto
    const porcentajePacto = Math.max(
        0,
        Math.min(100, (escanosPacto * 100) / numEscanos)
    );

    const fill = document.getElementById("pacto_bar_fill");
    const marca = document.getElementById("pacto_bar_majoria");
    const txtEscanos = document.getElementById("pacto_escanos_texto");
    const txtMayoria = document.getElementById("pacto_mayoria_texto");

    const mayoria = Math.floor(numEscanos / 2) + 1;

    if (fill) {
        // 1) Ancho del relleno según porcentaje real de escaños
        fill.style.width = porcentajePacto + "%";

        // 2) Color o gradiente del relleno
        if (partidosSeleccionados.length === 0 || escanosPacto === 0) {
            // Sin partidos seleccionados, color por defecto
            fill.style.background = DEFAULT_PARTY_COLOR;
        } else if (partidosSeleccionados.length === 1) {
            // Un solo partido: un solo color
            fill.style.background = partidosSeleccionados[0].color;
        } else {
            // Varios partidos: gradiente repartido al 100% del ancho del relleno
            const totalPacto = escanosPacto;
            let gradParts = [];
            let acumulado = 0;

            partidosSeleccionados.forEach((p, index) => {
                const anchoSegmento = (p.escanos / totalPacto) * 100;
                const inicio = acumulado;
                let fin;

                // El último segmento llega exactamente hasta el 100%
                if (index === partidosSeleccionados.length - 1) {
                    fin = 100;
                } else {
                    fin = acumulado + anchoSegmento;
                }

                gradParts.push(`${p.color} ${inicio}% ${fin}%`);
                acumulado = fin;
            });

            fill.style.background =
                `linear-gradient(to right, ${gradParts.join(", ")})`;
        }

        // Clase extra si se alcanza o supera la mayoría absoluta
        if (escanosPacto >= mayoria) {
            fill.classList.add("mayoria");
        } else {
            fill.classList.remove("mayoria");
        }
    }

    // Línea vertical que marca la mayoría absoluta
    if (marca) {
        const pos = (mayoria * 100) / numEscanos;
        marca.style.left = pos + "%";
    }

    // Textos inferiores del pactómetro
    if (txtEscanos) {
        txtEscanos.textContent =
            `Escaños del pacto: ${escanosPacto} de ${numEscanos} ` +
            `(${porcentajePacto.toFixed(1)}%)`;
    }

    if (txtMayoria) {
        txtMayoria.textContent = `Mayoría absoluta: ${mayoria} escaños`;
    }
}

// Dibuja el gráfico semicircular del hemiciclo usando Chart.js
function dibujarHemicicloChart(resultado, numEscanos) {
    const canvas = document.getElementById("hemicicloCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    // Si ya había un gráfico pintado, lo destruyo primero
    if (hemicicloChart) {
        hemicicloChart.destroy();
        hemicicloChart = null;
    }

    if (!resultado || resultado.length === 0) {
        return;
    }

    const labels = [];
    const data = [];
    const colors = [];

    // Solo añado partidos que tengan al menos un escaño
    resultado.forEach(p => {
        const esc = p.escanos || 0;
        if (esc > 0) {
            labels.push(p.nombre);
            data.push(esc);
            colors.push(p.color || DEFAULT_PARTY_COLOR);
        }
    });

    if (data.length === 0) {
        return;
    }

    hemicicloChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: "#ffffff",
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            rotation: 270,      // empiezo el doughnut abajo
            circumference: 180, // solo media circunferencia
            cutout: "55%",      // hueco interior del hemiciclo
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const label = context.label || "";
                            const value = context.raw || 0;
                            return `${label}: ${value} escaños`;
                        }
                    }
                }
            },
            layout: {
                padding: 0
            }
        }
    });
}

// Helpers para la tabla de resultado
function resetTablaResultado() {
    const tablaResultado = document.getElementById("tabla_resultado");
    if (!tablaResultado) return;

    // Cabecera fija de la tabla de resultados
    tablaResultado.innerHTML = `
        <tr>
            <th>Partido</th>
            <th>Votos</th>
            <th>Escaños</th>
            <th>Color</th>
        </tr>
    `;
}

// Crea una fila de resultado (marca en gris los que no superan el umbral)
function crearFilaResultadoPartido(fila, umbralPorcentaje) {
    const tr = document.createElement("tr");

    // Si hay umbral y este partido no lo supera, lo pinto atenuado
    const aplicaUmbral = umbralPorcentaje > 0 && fila.supera_umbral === false;

    if (aplicaUmbral) {
        tr.classList.add("text-muted");
    }

    const tdNombre = document.createElement("td");
    tdNombre.textContent = fila.nombre;
    if (aplicaUmbral) {
        tdNombre.textContent += " (no supera umbral)";
    }

    const tdVotos = document.createElement("td");
    tdVotos.textContent = fila.votos;

    const tdEscanos = document.createElement("td");
    tdEscanos.textContent = fila.escanos;

    const tdColor = document.createElement("td");
    if (fila.color) {
        const colorBox = document.createElement("div");
        colorBox.style.width = "20px";
        colorBox.style.height = "20px";
        colorBox.style.borderRadius = "4px";
        colorBox.style.border = "1px solid #ccc";
        colorBox.style.backgroundColor = fila.color || DEFAULT_PARTY_COLOR;
        tdColor.appendChild(colorBox);
    } else {
        tdColor.textContent = "-";
    }

    tr.appendChild(tdNombre);
    tr.appendChild(tdVotos);
    tr.appendChild(tdEscanos);
    tr.appendChild(tdColor);

    return tr;
}

// Pinta toda la parte de resultados: tabla, resumen, hemiciclo y pactómetro
function mostrarResultado(datos) {
    if (!datos) return;

    // Número total de escaños
    const info = document.getElementById("info_escanos");
    if (info) info.textContent = "Número total de escaños: " + (datos.num_escanos ?? "");

    // Tabla con todos los partidos
    resetTablaResultado();
    const tablaResultado = document.getElementById("tabla_resultado");

    if (tablaResultado && Array.isArray(datos.resultado)) {
        const umbral = datos.umbral_porcentaje ?? 0;

        datos.resultado.forEach(fila => {
            const tr = crearFilaResultadoPartido(fila, umbral);
            tablaResultado.appendChild(tr);
        });
    }

    // Resumen de votos (líneas de texto bajo la tabla)
    const linea1 = document.getElementById("resumen_votos_linea1");
    const linea2 = document.getElementById("resumen_votos_linea2");

    if (linea1) {
        linea1.textContent = `Votos en blanco: ${datos.votos_blanco ?? 0} · Votos nulos: ${datos.votos_nulos ?? 0}`;
    }

    if (linea2) {
        const totalValidos = datos.total_validos ?? 0;
        const totalEmitidos = datos.total_emitidos ?? 0;
        const umbralPct = datos.umbral_porcentaje ?? 0;
        const votosMinimos = datos.votos_minimos_umbral ?? 0;

        let textoLinea2 =
            `Votos válidos (partidos + blanco): ${totalValidos} · ` +
            `Votos emitidos (válidos + nulos): ${totalEmitidos}`;

        if (umbralPct > 0) {
            textoLinea2 += ` · Umbral: ${umbralPct}% (${votosMinimos} votos)`;
        }

        linea2.textContent = textoLinea2;
    }

    // Gráfico semicircular + pactómetro
    dibujarHemicicloChart(datos.resultado, datos.num_escanos);
    prepararPactometro(datos.resultado, datos.num_escanos);
}



// =========================
// LOGIN / LOGOUT
// =========================

// Actualiza la interfaz en función de si hay usuario logueado o no
function initAuthUI() {
    const usuarioId = localStorage.getItem("usuario_id");
    const username = localStorage.getItem("usuario_username");

    const loggedOut = document.getElementById("logged_out_view");
    const loggedIn = document.getElementById("logged_in_view");
    const emailSpan = document.getElementById("logged_in_email");

    const btnGuardar = document.getElementById("btn_guardar_simulacion");
    const btnVer = document.getElementById("btn_ver_simulaciones");
    const bloqueSim = document.getElementById("bloque_simulaciones");
    const listaDiv = document.getElementById("lista_simulaciones");

    const haySesion = !!(usuarioId && username);

    // Muestro/oculto el bloque de login en el header
    if (loggedOut && loggedIn) {
        if (haySesion) {
            loggedOut.classList.add("d-none");
            loggedIn.classList.remove("d-none");
            if (emailSpan) emailSpan.textContent = `Conectado como: ${username}`;
        } else {
            loggedOut.classList.remove("d-none");
            loggedIn.classList.add("d-none");
            if (emailSpan) emailSpan.textContent = "";
        }
    }

    // Botones de guardar/ver simulaciones (solo activos con sesión)
    if (btnGuardar) btnGuardar.disabled = !haySesion;
    if (btnVer) {
        btnVer.disabled = !haySesion;
        btnVer.textContent = "Ver simulaciones guardadas";
    }

    // Bloque de simulaciones: lo bloqueo si no hay sesión
    if (bloqueSim && listaDiv) {
        if (haySesion) {
            bloqueSim.classList.remove("bloqueado");
            listaDiv.innerHTML = "";
        } else {
            bloqueSim.classList.add("bloqueado");
            listaDiv.innerHTML = "<p class='text-muted'>Inicia sesión para ver tus simulaciones.</p>";
        }
        listaDiv.dataset.visible = "0";
    }

    limpiarEstadoNombreSimulacion();
}

// Registro de usuario nuevo
async function doRegister() {
    const username = document.getElementById("auth_username").value.trim();
    const password = document.getElementById("auth_password").value;

    if (!username || !password) {
        alert("Introduce nombre de usuario y contraseña para registrarte.");
        return;
    }

    const data = await apiFetchJSON(
        `${API_URL}/register`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        },
        "No se pudo registrar el usuario."
    );

    if (!data) return;

    localStorage.setItem("usuario_id", data.usuario_id);
    localStorage.setItem("usuario_username", data.username);

    alert("Usuario registrado y sesión iniciada.");
    initAuthUI();
}

// Inicio de sesión
async function doLogin() {
    const username = document.getElementById("auth_username").value.trim();
    const password = document.getElementById("auth_password").value;

    if (!username || !password) {
        alert("Introduce nombre de usuario y contraseña.");
        return;
    }

    const data = await apiFetchJSON(
        `${API_URL}/login`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        },
        "Credenciales incorrectas."
    );

    if (!data) return;

    localStorage.setItem("usuario_id", data.usuario_id);
    localStorage.setItem("usuario_username", data.username);

    alert("Sesión iniciada correctamente.");
    initAuthUI();
}

// Cierre de sesión: limpio localStorage y reinicio la UI
function doLogout() {
    localStorage.removeItem("usuario_id");
    localStorage.removeItem("usuario_username");

    const inputUser = document.getElementById("auth_username");
    const inputPass = document.getElementById("auth_password");
    if (inputUser) inputUser.value = "";
    if (inputPass) inputPass.value = "";

    resetSimulacionUI();

    alert("Sesión cerrada.");
    initAuthUI();
}

// Restaura el estado inicial de la simulación (como recién cargada la página)
function resetSimulacionUI() {
    const nombre = document.getElementById("nombre_simulacion");
    if (nombre) nombre.value = "";

    const numEscanos = document.getElementById("num_escanos");
    if (numEscanos) numEscanos.value = 7;

    const vb = document.getElementById("votos_blanco");
    if (vb) vb.value = 0;

    const vn = document.getElementById("votos_nulos");
    if (vn) vn.value = 0;

    const umbral = document.getElementById("umbral");
    if (umbral) umbral.value = 0;

    const tbody = document.getElementById("tbody_partidos");
    if (tbody) {
        // Restaurar partidos por defecto (como en el HTML inicial)
        tbody.innerHTML = `
            <tr>
                <td><input type="text" class="form-control" value="A"></td>
                <td><input type="number" class="form-control" value="34000"></td>
                <td><input type="color" class="form-control form-control-color" value="#1f979a"></td>
            </tr>
            <tr>
                <td><input type="text" class="form-control" value="B"></td>
                <td><input type="number" class="form-control" value="28000"></td>
                <td><input type="color" class="form-control form-control-color" value="#e67e22"></td>
            </tr>
            <tr>
                <td><input type="text" class="form-control" value="C"></td>
                <td><input type="number" class="form-control" value="16000"></td>
                <td><input type="color" class="form-control form-control-color" value="#9b59b6"></td>
            </tr>
        `;
    }

    const info = document.getElementById("info_escanos");
    if (info) info.textContent = "";

    resetTablaResultado();

    const linea1 = document.getElementById("resumen_votos_linea1");
    if (linea1) linea1.textContent = "";

    const linea2 = document.getElementById("resumen_votos_linea2");
    if (linea2) linea2.textContent = "";

    // Limpio el gráfico del hemiciclo
    if (hemicicloChart) {
        hemicicloChart.destroy();
        hemicicloChart = null;
    }
    const canvas = document.getElementById("hemicicloCanvas");
    if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Limpio la parte visual del pactómetro
    const pactoPartidos = document.getElementById("pacto_partidos");
    if (pactoPartidos) pactoPartidos.innerHTML = "";

    const fill = document.getElementById("pacto_bar_fill");
    if (fill) {
        fill.style.width = "0%";
        fill.style.background = DEFAULT_PARTY_COLOR;
        fill.classList.remove("mayoria");
    }

    const marca = document.getElementById("pacto_bar_majoria");
    if (marca) {
        marca.style.left = "0%";
    }

    const txtEscanos = document.getElementById("pacto_escanos_texto");
    if (txtEscanos) txtEscanos.textContent = "";

    const txtMayoria = document.getElementById("pacto_mayoria_texto");
    if (txtMayoria) txtMayoria.textContent = "";

    // Restauro el texto del bloque de simulaciones
    const listaDiv = document.getElementById("lista_simulaciones");
    if (listaDiv) {
        listaDiv.innerHTML = "<p class='text-muted'>Inicia sesión para ver tus simulaciones.</p>";
        listaDiv.dataset.visible = "0";
    }

    limpiarErroresValidacion();
    limpiarEstadoNombreSimulacion();
}



// =========================
// NOMBRE DE SIMULACIÓN (COMPROBACIÓN SUAVE)
// =========================

// Comprueba si el nombre de simulación ya existe y lo marca en amarillo si se repite
async function comprobarNombreSimulacion() {
    const input = document.getElementById("nombre_simulacion");
    if (!input) return;

    const usuarioId = localStorage.getItem("usuario_id");
    if (!usuarioId) {
        limpiarEstadoNombreSimulacion();
        return;
    }

    const nombre = input.value.trim();
    if (nombre === "") {
        limpiarEstadoNombreSimulacion();
        return;
    }

    try {
        const simsResp = await fetch(`${API_URL}/simulaciones?usuario_id=${usuarioId}`);
        if (!simsResp.ok) return;

        const listas = await simsResp.json();
        const existe = listas.some(
            sim => (sim.nombre || "").trim().toLowerCase() === nombre.toLowerCase()
        );

        if (existe) {
            input.style.backgroundColor = "#fff3cd";
            input.title = "Este nombre ya existe. Si guardas, sobrescribirás la simulación.";
        } else {
            limpiarEstadoNombreSimulacion();
        }
    } catch (error) {
        console.error("Error comprobando nombre de simulación:", error);
    }
}

// Devuelve el input de nombre de simulación a su estado normal
function limpiarEstadoNombreSimulacion() {
    const input = document.getElementById("nombre_simulacion");
    if (!input) return;

    input.classList.remove("is-invalid");
    input.style.backgroundColor = "";
    input.title = "";
}



// =========================
// VALIDACIÓN FORMULARIO COMPLETO
// =========================

// Valida todos los datos del formulario antes de calcular o guardar
function obtenerYValidarDatosFormulario({ exigirNombre = false } = {}) {
    limpiarErroresValidacion();

    const inputNombreSim = document.getElementById("nombre_simulacion");
    const inputNumEscanos = document.getElementById("num_escanos");
    const inputBlanco = document.getElementById("votos_blanco");
    const inputNulos = document.getElementById("votos_nulos");
    const inputUmbral = document.getElementById("umbral");

    const nombre = inputNombreSim ? inputNombreSim.value.trim() : "";
    const numEscanos = parseInt(inputNumEscanos.value);
    const votosBlanco = parseInt(inputBlanco.value) || 0;
    const votosNulos = parseInt(inputNulos.value) || 0;
    const umbral = parseFloat(inputUmbral.value);
    const umbralValor = isNaN(umbral) ? 0 : umbral;

    let hayError = false;

    // En guardar simulación exijo que haya nombre obligatorio
    if (exigirNombre && nombre === "") {
        if (inputNombreSim) {
            inputNombreSim.classList.add("is-invalid");
        }
        hayError = true;
    }

    // Resto de validaciones numéricas
    if (isNaN(numEscanos) || numEscanos < 1) {
        inputNumEscanos.classList.add("is-invalid");
        hayError = true;
    }

    if (votosBlanco < 0) {
        inputBlanco.classList.add("is-invalid");
        hayError = true;
    }

    if (votosNulos < 0) {
        inputNulos.classList.add("is-invalid");
        hayError = true;
    }

    if (umbralValor < 0 || umbralValor > 100) {
        inputUmbral.classList.add("is-invalid");
        hayError = true;
    }

    // Partidos leídos desde la tabla
    const partidos = leerYValidarPartidosDesdeTabla();
    if (partidos.length === 0) {
        hayError = true;
    }

    // Comprobación extra: suma total de votos de partidos no puede ser 0
    const totalVotosPartidos = partidos.reduce((suma, p) => suma + p.votos, 0);
    if (totalVotosPartidos === 0) {
        alert("Debe haber al menos un voto para poder hacer el reparto o guardar la simulación.");
        return null;
    }

    // Si queda algún input con is-invalid, paro aquí
    if (hayError || document.querySelector("input.is-invalid")) {
        alert("Hay errores en el formulario. Revisa los campos en rojo.");
        return null;
    }

    return {
        nombre,
        numEscanos,
        votosBlanco,
        votosNulos,
        umbralValor,
        partidos
    };
}



// =========================
// EVENTOS GLOBALES
// =========================

// Mientras se escribe: solo limpio el rojo si el valor pasa a ser correcto
document.addEventListener("input", function (e) {
    if (e.target.tagName === "INPUT") {
        validarInputIndividual(e.target, { soloLimpiar: true });
    }
});

// Al perder el foco: aquí sí marco en rojo si el valor está mal
document.addEventListener("blur", function (e) {
    if (e.target.tagName === "INPUT") {
        validarInputIndividual(e.target); // soloLimpiar = false
    }

    // Comprobación “suave” del nombre de simulación (para avisar de duplicados)
    if (e.target && e.target.id === "nombre_simulacion") {
        comprobarNombreSimulacion();
    }
}, true);

// Al cargar la página, inicializo la UI de autenticación según localStorage
document.addEventListener("DOMContentLoaded", initAuthUI);
