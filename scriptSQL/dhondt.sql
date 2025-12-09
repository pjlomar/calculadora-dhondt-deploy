-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 09-12-2025 a las 13:27:51
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `dhondt`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `simulaciones`
--

CREATE TABLE `simulaciones` (
  `id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `datos_json` text NOT NULL,
  `fecha` timestamp NOT NULL DEFAULT current_timestamp(),
  `usuario_id` int(11) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `simulaciones`
--

INSERT INTO `simulaciones` (`id`, `nombre`, `datos_json`, `fecha`, `usuario_id`) VALUES
(17, 'uno', '{\"num_escanos\": 21, \"votos_blanco\": 233, \"votos_nulos\": 545, \"umbral_porcentaje\": 5.0, \"votos_minimos_umbral\": 5911, \"total_validos\": 118233, \"total_emitidos\": 118778, \"partidos\": [{\"nombre\": \"A\", \"votos\": 34000, \"color\": \"#1f979a\"}, {\"nombre\": \"B\", \"votos\": 28000, \"color\": \"#e67e22\"}, {\"nombre\": \"C\", \"votos\": 16000, \"color\": \"#9b59b6\"}, {\"nombre\": \"D\", \"votos\": 12000, \"color\": \"#981f4a\"}, {\"nombre\": \"E\", \"votos\": 23000, \"color\": \"#0a060f\"}, {\"nombre\": \"F\", \"votos\": 5000, \"color\": \"#1bb65e\"}], \"resultado\": [{\"nombre\": \"A\", \"votos\": 34000, \"escanos\": 7, \"color\": \"#1f979a\", \"supera_umbral\": true}, {\"nombre\": \"B\", \"votos\": 28000, \"escanos\": 5, \"color\": \"#e67e22\", \"supera_umbral\": true}, {\"nombre\": \"C\", \"votos\": 16000, \"escanos\": 3, \"color\": \"#9b59b6\", \"supera_umbral\": true}, {\"nombre\": \"D\", \"votos\": 12000, \"escanos\": 2, \"color\": \"#981f4a\", \"supera_umbral\": true}, {\"nombre\": \"E\", \"votos\": 23000, \"escanos\": 4, \"color\": \"#0a060f\", \"supera_umbral\": true}, {\"nombre\": \"F\", \"votos\": 5000, \"escanos\": 0, \"color\": \"#1bb65e\", \"supera_umbral\": false}], \"nombre\": \"uno\"}', '2025-11-29 14:43:14', 5),
(18, 'Elecciones prueba', '{\"num_escanos\": 24, \"votos_blanco\": 0, \"votos_nulos\": 0, \"umbral_porcentaje\": 0.0, \"votos_minimos_umbral\": 0, \"total_validos\": 152000, \"total_emitidos\": 152000, \"partidos\": [{\"nombre\": \"A\", \"votos\": 55000, \"color\": \"#1f979a\"}, {\"nombre\": \"B\", \"votos\": 28000, \"color\": \"#e67e22\"}, {\"nombre\": \"C\", \"votos\": 16000, \"color\": \"#9b59b6\"}, {\"nombre\": \"D\", \"votos\": 38000, \"color\": \"#981f37\"}, {\"nombre\": \"E\", \"votos\": 15000, \"color\": \"#78981f\"}], \"resultado\": [{\"nombre\": \"A\", \"votos\": 55000, \"escanos\": 9, \"color\": \"#1f979a\", \"supera_umbral\": true}, {\"nombre\": \"B\", \"votos\": 28000, \"escanos\": 5, \"color\": \"#e67e22\", \"supera_umbral\": true}, {\"nombre\": \"C\", \"votos\": 16000, \"escanos\": 2, \"color\": \"#9b59b6\", \"supera_umbral\": true}, {\"nombre\": \"D\", \"votos\": 38000, \"escanos\": 6, \"color\": \"#981f37\", \"supera_umbral\": true}, {\"nombre\": \"E\", \"votos\": 15000, \"escanos\": 2, \"color\": \"#78981f\", \"supera_umbral\": true}], \"nombre\": \"Elecciones prueba\"}', '2025-12-05 11:15:07', 5);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `usuarios`
--

CREATE TABLE `usuarios` (
  `id` int(11) NOT NULL,
  `username` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `fecha_registro` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Volcado de datos para la tabla `usuarios`
--

INSERT INTO `usuarios` (`id`, `username`, `password_hash`, `fecha_registro`) VALUES
(5, 'pedro juan', 'dec0fd81f7dda192ef55e143c82fdc757c043c7669fc3b6170bc882ee0f0b31a', '2025-11-29 14:40:00');

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `simulaciones`
--
ALTER TABLE `simulaciones`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_simulaciones_usuario` (`usuario_id`);

--
-- Indices de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`username`),
  ADD UNIQUE KEY `username` (`username`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `simulaciones`
--
ALTER TABLE `simulaciones`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=19;

--
-- AUTO_INCREMENT de la tabla `usuarios`
--
ALTER TABLE `usuarios`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `simulaciones`
--
ALTER TABLE `simulaciones`
  ADD CONSTRAINT `fk_simulaciones_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
