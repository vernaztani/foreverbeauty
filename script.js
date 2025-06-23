// Constantes para la base de datos IndexedDB
const DB_NAME = 'FisioDermatofuncionalDB';
const DB_VERSION = 1;
const STORE_NAME_PACIENTES = 'pacientes';
const STORE_NAME_CONSULTAS = 'consultas';

let db; // Variable para almacenar la instancia de la base de datos

// --- Funciones de Utilidad ---

/**
 * Calcula la edad de una persona a partir de su fecha de nacimiento.
 * @param {string} fechaNacimientoString Formato YYYY-MM-DD.
 * @returns {number} La edad actual.
 */
function calcularEdad(fechaNacimientoString) {
    const fechaNacimiento = new Date(fechaNacimientoString + 'T00:00:00'); // Añadir T00:00:00 para evitar problemas de zona horaria
    const hoy = new Date();
    let edad = hoy.getFullYear() - fechaNacimiento.getFullYear();
    const mes = hoy.getMonth() - fechaNacimiento.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNacimiento.getDate())) {
        edad--;
    }
    return edad;
}

/**
 * Formatea una fecha a YYYY-MM-DD.
 * @param {Date} date Objeto Date.
 * @returns {string} Fecha en formato YYYY-MM-DD.
 */
function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- Gestión de IndexedDB ---

/**
 * Abre la base de datos IndexedDB.
 * Si no existe, la crea y configura los object stores.
 * @returns {Promise<IDBDatabase>} Una promesa que resuelve con la instancia de la base de datos.
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            // Crear o actualizar el object store para pacientes
            if (!db.objectStoreNames.contains(STORE_NAME_PACIENTES)) {
                const pacienteStore = db.createObjectStore(STORE_NAME_PACIENTES, { keyPath: 'id', autoIncrement: true });
                pacienteStore.createIndex('nombre', 'nombre', { unique: false });
            }
            // Crear o actualizar el object store para consultas
            if (!db.objectStoreNames.contains(STORE_NAME_CONSULTAS)) {
                const consultaStore = db.createObjectStore(STORE_NAME_CONSULTAS, { keyPath: 'id', autoIncrement: true });
                consultaStore.createIndex('pacienteId', 'pacienteId', { unique: false });
                consultaStore.createIndex('fecha', 'fecha', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('Base de datos abierta con éxito');
            resolve(db);
        };

        request.onerror = (event) => {
            console.error('Error al abrir la base de datos:', event.target.error);
            reject(event.target.error);
        };
    });
}

/**
 * Agrega un nuevo paciente a la base de datos.
 * @param {Object} pacienteData Datos del paciente.
 * @returns {Promise<number>} Una promesa que resuelve con el ID del nuevo paciente.
 */
async function addPaciente(pacienteData) {
    const transaction = db.transaction([STORE_NAME_PACIENTES], 'readwrite');
    const store = transaction.objectStore(STORE_NAME_PACIENTES);
    return new Promise((resolve, reject) => {
        const request = store.add(pacienteData);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Obtiene todos los pacientes de la base de datos.
 * @returns {Promise<Array<Object>>} Una promesa que resuelve con un array de pacientes.
 */
async function getAllPacientes() {
    const transaction = db.transaction([STORE_NAME_PACIENTES], 'readonly');
    const store = transaction.objectStore(STORE_NAME_PACIENTES);
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Busca pacientes por nombre (parcial o completo).
 * @param {string} nombreBusqueda Nombre o parte del nombre a buscar.
 * @returns {Promise<Array<Object>>} Una promesa que resuelve con un array de pacientes que coinciden.
 */
async function searchPacientes(nombreBusqueda) {
    const transaction = db.transaction([STORE_NAME_PACIENTES], 'readonly');
    const store = transaction.objectStore(STORE_NAME_PACIENTES);
    const index = store.index('nombre');
    const lowerCaseSearch = nombreBusqueda.toLowerCase();

    return new Promise((resolve, reject) => {
        const results = [];
        index.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                if (cursor.value.nombre.toLowerCase().includes(lowerCaseSearch)) {
                    results.push(cursor.value);
                }
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        index.openCursor().onerror = (event) => reject(event.target.error);
    });
}


/**
 * Obtiene un paciente por su ID.
 * @param {number} id ID del paciente.
 * @returns {Promise<Object>} Una promesa que resuelve con el objeto paciente.
 */
async function getPacienteById(id) {
    const transaction = db.transaction([STORE_NAME_PACIENTES], 'readonly');
    const store = transaction.objectStore(STORE_NAME_PACIENTES);
    return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Actualiza la información de un paciente existente.
 * @param {Object} pacienteData Objeto paciente con la información actualizada (debe incluir el ID).
 * @returns {Promise<void>} Una promesa que resuelve cuando la actualización es exitosa.
 */
async function updatePaciente(pacienteData) {
    const transaction = db.transaction([STORE_NAME_PACIENTES], 'readwrite');
    const store = transaction.objectStore(STORE_NAME_PACIENTES);
    return new Promise((resolve, reject) => {
        const request = store.put(pacienteData);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Elimina un paciente de la base de datos por su ID.
 * También elimina todas las consultas asociadas a ese paciente.
 * @param {number} id ID del paciente a eliminar.
 * @returns {Promise<void>} Una promesa que resuelve cuando la eliminación es exitosa.
 */
async function deletePaciente(id) {
    // Eliminar consultas asociadas primero
    const consultasToDelete = await getConsultasByPacienteId(id);
    if (consultasToDelete.length > 0) {
        const transactionConsultas = db.transaction([STORE_NAME_CONSULTAS], 'readwrite');
        const storeConsultas = transactionConsultas.objectStore(STORE_NAME_CONSULTAS);
        for (const consulta of consultasToDelete) {
            storeConsultas.delete(consulta.id);
        }
        await new Promise((resolve, reject) => {
            transactionConsultas.oncomplete = () => resolve();
            transactionConsultas.onerror = () => reject(transactionConsultas.error);
        });
    }

    // Luego eliminar el paciente
    const transactionPaciente = db.transaction([STORE_NAME_PACIENTES], 'readwrite');
    const storePaciente = transactionPaciente.objectStore(STORE_NAME_PACIENTES);
    return new Promise((resolve, reject) => {
        const request = storePaciente.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}


/**
 * Agrega una nueva consulta al historial de un paciente.
 * @param {Object} consultaData Datos de la consulta (pacienteId, fecha, notas).
 * @returns {Promise<number>} Una promesa que resuelve con el ID de la nueva consulta.
 */
async function addConsulta(consultaData) {
    const transaction = db.transaction([STORE_NAME_CONSULTAS], 'readwrite');
    const store = transaction.objectStore(STORE_NAME_CONSULTAS);
    return new Promise((resolve, reject) => {
        const request = store.add(consultaData);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Obtiene todas las consultas de un paciente específico.
 * @param {number} pacienteId ID del paciente.
 * @returns {Promise<Array<Object>>} Una promesa que resuelve con un array de consultas.
 */
async function getConsultasByPacienteId(pacienteId) {
    const transaction = db.transaction([STORE_NAME_CONSULTAS], 'readonly');
    const store = transaction.objectStore(STORE_NAME_CONSULTAS);
    const index = store.index('pacienteId');
    const range = IDBKeyRange.only(pacienteId);

    return new Promise((resolve, reject) => {
        const results = [];
        index.openCursor(range).onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                results.push(cursor.value);
                cursor.continue();
            } else {
                // Ordenar las consultas por fecha, las más recientes primero
                results.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
                resolve(results);
            }
        };
        index.openCursor(range).onerror = (event) => reject(event.target.error);
    });
}

// --- Gestión de Importación/Exportación de Datos ---

async function exportAllData() {
    try {
        const pacientes = await getAllPacientes();
        const consultas = await new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME_CONSULTAS], 'readonly');
            const store = transaction.objectStore(STORE_NAME_CONSULTAS);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        const data = {
            pacientes: pacientes,
            consultas: consultas
        };

        const jsonString = JSON.stringify(data, null, 2); // Formato legible con indentación
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `fisio_dermatofuncional_backup_${formatDate(new Date())}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert('Datos exportados con éxito. Revisa tus descargas.');
    } catch (error) {
        console.error('Error al exportar datos:', error);
        alert('Error al exportar los datos. Consulta la consola para más detalles.');
    }
}

async function importAllData(file) {
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const data = JSON.parse(event.target.result);
            const pacientesToImport = data.pacientes || [];
            const consultasToImport = data.consultas || [];

            if (!confirm('¿Estás seguro de que quieres importar estos datos? Esto reemplazará o fusionará los datos existentes en tu base de datos actual.')) {
                return;
            }

            await clearAllStores(); // Limpiar antes de importar para evitar duplicados si la intención es reemplazar

            const transactionPacientes = db.transaction([STORE_NAME_PACIENTES], 'readwrite');
            const storePacientes = transactionPacientes.objectStore(STORE_NAME_PACIENTES);

            for (const paciente of pacientesToImport) {
                await new Promise((resolve, reject) => {
                    const req = storePacientes.put(paciente); // put actualiza si el id existe, añade si no
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            }

            const transactionConsultas = db.transaction([STORE_NAME_CONSULTAS], 'readwrite');
            const storeConsultas = transactionConsultas.objectStore(STORE_NAME_CONSULTAS);

            for (const consulta of consultasToImport) {
                await new Promise((resolve, reject) => {
                    const req = storeConsultas.put(consulta);
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            }

            alert('Datos importados con éxito. La página se recargará para aplicar los cambios.');
            window.location.reload();

        } catch (error) {
            console.error('Error al importar datos:', error);
            const importMessage = document.getElementById('importMessage');
            importMessage.textContent = 'Error al importar datos. Asegúrate de que el archivo es un JSON válido.';
            importMessage.style.backgroundColor = '#f8d7da';
            importMessage.style.color = '#721c24';
            importMessage.style.display = 'inline';
            setTimeout(() => {
                importMessage.style.display = 'none';
            }, 5000);
        }
    };
    reader.onerror = (error) => {
        console.error('Error al leer el archivo:', error);
        alert('Error al leer el archivo.');
    };
    reader.readAsText(file);
}

// Función auxiliar para limpiar todos los object stores antes de importar
async function clearAllStores() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME_PACIENTES, STORE_NAME_CONSULTAS], 'readwrite');
        const storePacientes = transaction.objectStore(STORE_NAME_PACIENTES);
        const storeConsultas = transaction.objectStore(STORE_NAME_CONSULTAS);

        const req1 = storePacientes.clear();
        const req2 = storeConsultas.clear();

        let count = 0;
        const checkCompletion = () => {
            count++;
            if (count === 2) {
                resolve();
            }
        };

        req1.onsuccess = checkCompletion;
        req2.onsuccess = checkCompletion;

        req1.onerror = (e) => reject(e.target.error);
        req2.onerror = (e) => reject(e.target.error);
    });
}


// --- Event Listeners y Lógica de Interfaz ---

document.addEventListener('DOMContentLoaded', async () => {
    // Abrir la base de datos al cargar la página
    await openDB();

    const nombreInput = document.getElementById('nombre');
    const fechaNacimientoInput = document.getElementById('fechaNacimiento');
    const motivoConsultaInput = document.getElementById('motivoConsulta');
    const diagnosticoFisioInput = document.getElementById('diagnosticoFisio');
    const antecedentesInput = document.getElementById('antecedentes');
    const guardarPacienteBtn = document.getElementById('guardarPaciente');
    const mensajeGuardado = document.getElementById('mensajeGuardado');

    const busquedaNombreInput = document.getElementById('busquedaNombre');
    const mostrarTodosBtn = document.getElementById('mostrarTodos');
    const resultadosBusquedaDiv = document.getElementById('resultadosBusqueda');

    // Elementos de importación/exportación
    const exportarDatosBtn = document.getElementById('exportarDatos');
    const importarArchivoInput = document.getElementById('importarArchivo');
    const importarDatosBtn = document.getElementById('importarDatos');
    const importMessage = document.getElementById('importMessage');


    // Modal elements
    const editModal = document.getElementById('editModal');
    const closeButton = document.querySelector('.close-button');
    const modalPacienteNombre = document.getElementById('modalPacienteNombre');
    const modalPacienteFechaNac = document.getElementById('modalPacienteFechaNac');
    const modalPacienteEdad = document.getElementById('modalPacienteEdad');
    const modalMotivoConsulta = document.getElementById('modalMotivoConsulta');
    const modalDiagnosticoFisio = document.getElementById('modalDiagnosticoFisio');
    const modalAntecedentes = document.getElementById('modalAntecedentes');
    const guardarCambiosExpedienteBtn = document.getElementById('guardarCambiosExpediente');
    const eliminarPacienteModalBtn = document.getElementById('eliminarPacienteModalBtn');
    const mensajeEdicion = document.getElementById('mensajeEdicion');

    const fechaConsultaInput = document.getElementById('fechaConsulta');
    const notasConsultaInput = document.getElementById('notasConsulta');
    const agregarConsultaBtn = document.getElementById('agregarConsulta');
    const listaConsultasDiv = document.getElementById('listaConsultas');

    let currentPacienteId = null; // Para saber qué paciente estamos editando en el modal

    // --- Funcionalidad de Registrar Paciente ---
    guardarPacienteBtn.addEventListener('click', async () => {
        const nombre = nombreInput.value.trim();
        const fechaNacimiento = fechaNacimientoInput.value; // YYYY-MM-DD
        const motivoConsulta = motivoConsultaInput.value.trim();
        const diagnosticoFisio = diagnosticoFisioInput.value.trim();
        const antecedentes = antecedentesInput.value.trim();

        if (nombre && fechaNacimiento) {
            const pacienteData = {
                nombre,
                fechaNacimiento,
                motivoConsulta,
                diagnosticoFisio,
                antecedentes
            };

            try {
                await addPaciente(pacienteData);
                mensajeGuardado.textContent = '¡Paciente guardado con éxito!';
                mensajeGuardado.style.backgroundColor = '#d4edda';
                mensajeGuardado.style.color = '#155724';
                mensajeGuardado.style.display = 'block'; // Mostrar el mensaje
                nombreInput.value = '';
                fechaNacimientoInput.value = '';
                motivoConsultaInput.value = '';
                diagnosticoFisioInput.value = '';
                antecedentesInput.value = '';
                await displayAllPacientes(); // Actualizar lista de pacientes
            } catch (error) {
                mensajeGuardado.textContent = 'Error al guardar el paciente.';
                mensajeGuardado.style.backgroundColor = '#f8d7da';
                mensajeGuardado.style.color = '#721c24';
                mensajeGuardado.style.display = 'block'; // Mostrar el mensaje
                console.error('Error al guardar paciente:', error);
            } finally {
                setTimeout(() => {
                    mensajeGuardado.style.display = 'none'; // Ocultar mensaje después de 3 segundos
                    mensajeGuardado.textContent = '';
                }, 3000);
            }
        } else {
            mensajeGuardado.textContent = 'Por favor, completa el nombre y la fecha de nacimiento.';
            mensajeGuardado.style.backgroundColor = '#fff3cd';
            mensajeGuardado.style.color = '#856404';
            mensajeGuardado.style.display = 'block'; // Mostrar el mensaje
            setTimeout(() => {
                mensajeGuardado.style.display = 'none'; // Ocultar mensaje después de 3 segundos
                mensajeGuardado.textContent = '';
            }, 3000);
        }
    });

    // --- Funcionalidad de Búsqueda Instantánea ---
    busquedaNombreInput.addEventListener('input', async () => {
        const nombreBusqueda = busquedaNombreInput.value.trim();
        if (nombreBusqueda.length > 0) {
            const pacientes = await searchPacientes(nombreBusqueda);
            displayPacientes(pacientes);
        } else {
            displayAllPacientes();
        }
    });

    mostrarTodosBtn.addEventListener('click', async () => {
        busquedaNombreInput.value = '';
        await displayAllPacientes();
    });

    // --- Función para mostrar pacientes en la interfaz ---
    async function displayPacientes(pacientes) {
        resultadosBusquedaDiv.innerHTML = '';
        if (pacientes.length === 0) {
            resultadosBusquedaDiv.innerHTML = '<p class="no-results">No se encontraron pacientes.</p>';
            return;
        }

        pacientes.forEach(paciente => {
            const pacienteCard = document.createElement('div');
            pacienteCard.classList.add('patient-card');
            pacienteCard.innerHTML = `
                <div>
                    <strong>Nombre:</strong> <span>${paciente.nombre}</span><br>
                    <strong>Fecha Nacimiento:</strong> <span>${paciente.fechaNacimiento}</span><br>
                    <strong>Edad:</strong> <span>${calcularEdad(paciente.fechaNacimiento)} años</span>
                </div>
                <div>
                    <button class="view-expediente-btn" data-id="${paciente.id}">Ver Expediente</button>
                    <button class="delete-patient-btn" data-id="${paciente.id}">Eliminar</button>
                </div>
            `;
            resultadosBusquedaDiv.appendChild(pacienteCard);
        });

        // Añadir listeners a los botones "Ver Expediente"
        document.querySelectorAll('.view-expediente-btn').forEach(button => {
            button.addEventListener('click', async (event) => {
                const pacienteId = parseInt(event.target.dataset.id);
                await openExpedienteModal(pacienteId);
            });
        });

        // Añadir listeners a los botones "Eliminar" de las tarjetas de búsqueda
        document.querySelectorAll('.delete-patient-btn').forEach(button => {
            if (button.id !== 'eliminarPacienteModalBtn') { // Asegurarse de que no sea el botón del modal
                button.addEventListener('click', async (event) => {
                    const pacienteId = parseInt(event.target.dataset.id);
                    const paciente = await getPacienteById(pacienteId);

                    if (paciente && confirm(`¿Estás seguro de que quieres eliminar a ${paciente.nombre}? Esta acción es irreversible y también borrará todas sus consultas.`)) {
                        try {
                            await deletePaciente(pacienteId);
                            alert('Paciente eliminado con éxito.');
                            await displayAllPacientes();
                        } catch (error) {
                            alert('Error al eliminar el paciente.');
                            console.error('Error deleting patient:', error);
                        }
                    }
                });
            }
        });
    }

    async function displayAllPacientes() {
        const allPacientes = await getAllPacientes();
        displayPacientes(allPacientes);
    }

    // Mostrar todos los pacientes al cargar la página inicialmente
    await displayAllPacientes();

    // --- Funcionalidad de Exportar/Importar Datos ---
    exportarDatosBtn.addEventListener('click', exportAllData);

    importarDatosBtn.addEventListener('click', () => {
        importarArchivoInput.click();
    });

    importarArchivoInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) {
            importMessage.textContent = 'Importando datos...';
            importMessage.style.backgroundColor = '#fff3cd';
            importMessage.style.color = '#856404';
            importMessage.style.display = 'block'; // Mostrar el mensaje
            await importAllData(file);
            event.target.value = ''; // Limpiar el input file
        }
    });


    // --- Funcionalidad del Modal de Expediente ---
    closeButton.addEventListener('click', () => {
        editModal.style.display = 'none';
        mensajeEdicion.textContent = '';
        mensajeEdicion.style.display = 'none'; // Ocultar mensaje al cerrar
    });

    window.addEventListener('click', (event) => {
        if (event.target === editModal) {
            editModal.style.display = 'none';
            mensajeEdicion.textContent = '';
            mensajeEdicion.style.display = 'none'; // Ocultar mensaje al cerrar
        }
    });

    async function openExpedienteModal(id) {
        currentPacienteId = id;
        const paciente = await getPacienteById(id);
        if (paciente) {
            modalPacienteNombre.textContent = paciente.nombre;
            modalPacienteFechaNac.textContent = paciente.fechaNacimiento;
            modalPacienteEdad.textContent = `${calcularEdad(paciente.fechaNacimiento)} años`;
            modalMotivoConsulta.value = paciente.motivoConsulta || '';
            modalDiagnosticoFisio.value = paciente.diagnosticoFisio || '';
            modalAntecedentes.value = paciente.antecedentes || '';

            await displayConsultas(id);

            editModal.style.display = 'block';
        } else {
            console.error('Paciente no encontrado:', id);
            alert('Error: Paciente no encontrado.');
        }
    }

    // Guardar cambios del expediente (diagnóstico, motivo, antecedentes)
    guardarCambiosExpedienteBtn.addEventListener('click', async () => {
        if (currentPacienteId !== null) {
            const paciente = await getPacienteById(currentPacienteId);
            if (paciente) {
                paciente.motivoConsulta = modalMotivoConsulta.value.trim();
                paciente.diagnosticoFisio = modalDiagnosticoFisio.value.trim();
                paciente.antecedentes = modalAntecedentes.value.trim();

                try {
                    await updatePaciente(paciente);
                    mensajeEdicion.textContent = '¡Expediente actualizado con éxito!';
                    mensajeEdicion.style.backgroundColor = '#d4edda';
                    mensajeEdicion.style.color = '#155724';
                    mensajeEdicion.style.display = 'block'; // Mostrar mensaje
                    modalPacienteEdad.textContent = `${calcularEdad(paciente.fechaNacimiento)} años`;
                } catch (error) {
                    mensajeEdicion.textContent = 'Error al actualizar el expediente.';
                    mensajeEdicion.style.backgroundColor = '#f8d7da';
                    mensajeEdicion.style.color = '#721c24';
                    mensajeEdicion.style.display = 'block'; // Mostrar mensaje
                    console.error('Error al actualizar paciente:', error);
                } finally {
                    setTimeout(() => {
                        mensajeEdicion.style.display = 'none'; // Ocultar mensaje después de 3 segundos
                        mensajeEdicion.textContent = '';
                    }, 3000);
                }
            }
        }
    });

    // Evento para el botón Eliminar Paciente dentro del modal
    eliminarPacienteModalBtn.addEventListener('click', async () => {
        if (currentPacienteId !== null) {
            const paciente = await getPacienteById(currentPacienteId);
            if (paciente && confirm(`¿Estás seguro de que quieres eliminar a ${paciente.nombre}? Esta acción es irreversible y también borrará todas sus consultas.`)) {
                try {
                    await deletePaciente(currentPacienteId);
                    alert('Paciente eliminado con éxito.');
                    editModal.style.display = 'none';
                    await displayAllPacientes();
                    currentPacienteId = null;
                } catch (error) {
                    alert('Error al eliminar el paciente.');
                    console.error('Error deleting patient from modal:', error);
                }
            }
        }
    });

    // --- Funcionalidad de Historial de Consultas ---
    agregarConsultaBtn.addEventListener('click', async () => {
        if (currentPacienteId !== null) {
            const fechaConsulta = fechaConsultaInput.value;
            const notasConsulta = notasConsultaInput.value.trim();

            if (fechaConsulta && notasConsulta) {
                const consultaData = {
                    pacienteId: currentPacienteId,
                    fecha: fechaConsulta,
                    notas: notasConsulta
                };
                try {
                    await addConsulta(consultaData);
                    alert('Consulta agregada con éxito.');
                    fechaConsultaInput.value = formatDate(new Date());
                    notasConsultaInput.value = '';
                    await displayConsultas(currentPacienteId);
                } catch (error) {
                    alert('Error al agregar la consulta.');
                    console.error('Error adding consultation:', error);
                }
            } else {
                alert('Por favor, ingresa la fecha y las notas de la consulta.');
            }
        }
    });

    async function displayConsultas(pacienteId) {
        listaConsultasDiv.innerHTML = '';
        const consultas = await getConsultasByPacienteId(pacienteId);

        if (consultas.length === 0) {
            listaConsultasDiv.innerHTML = '<p class="no-results">No hay consultas registradas para este paciente.</p>';
            return;
        }

        consultas.forEach(consulta => {
            const consultaItem = document.createElement('div');
            consultaItem.classList.add('consulta-item');
            consultaItem.innerHTML = `
                <strong>Fecha:</strong> <span>${consulta.fecha}</span>
                <p><strong>Notas:</strong> ${consulta.notas}</p>
            `;
            listaConsultasDiv.appendChild(consultaItem);
        });
    }

    // Establecer la fecha de la consulta por defecto a hoy
    fechaConsultaInput.value = formatDate(new Date());
});