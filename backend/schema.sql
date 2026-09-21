-- Ejecutar sobre la base de datos, desde el "Editor de consultas" (Query editor)
-- de Azure Portal (dentro del recurso de la base SQL) o desde Azure Data Studio / SSMS.
-- Todo el script es seguro de correr mas de una vez (cada bloque revisa si ya existe).

IF OBJECT_ID('dbo.DeviceRecords', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DeviceRecords (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        ComputerName NVARCHAR(255) NOT NULL,
        Bssids NVARCHAR(MAX) NOT NULL,
        Ip NVARCHAR(45) NULL,
        RecordTimestamp DATETIME2 NOT NULL,
        ReceivedAt DATETIME2 NOT NULL
    );
END;

-- ============================================================================
-- Normalizacion: Faenas / Areas / Personal / Equipos, y migracion de
-- DeviceRecords para que referencie un Equipo (EquipoId) en vez de repetir
-- el nombre del computador como texto en cada fila.
-- ============================================================================

IF OBJECT_ID('dbo.Faenas', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Faenas (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Nombre NVARCHAR(255) NOT NULL,
        Ubicacion NVARCHAR(255) NULL
    );
END;

IF OBJECT_ID('dbo.Areas', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Areas (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Nombre NVARCHAR(255) NOT NULL,
        FaenaId INT NOT NULL REFERENCES dbo.Faenas(Id)
    );
END;

IF OBJECT_ID('dbo.Personal', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Personal (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Rut NVARCHAR(20) NOT NULL,
        Nombre NVARCHAR(255) NOT NULL,
        Apellido NVARCHAR(255) NOT NULL,
        AreaId INT NULL REFERENCES dbo.Areas(Id),
        FaenaId INT NULL REFERENCES dbo.Faenas(Id)
    );
END;

IF OBJECT_ID('dbo.Equipos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Equipos (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        CodigoActivo NVARCHAR(50) NOT NULL,
        ComputerName NVARCHAR(255) NOT NULL,
        PersonalId INT NULL REFERENCES dbo.Personal(Id)
    );
END;

-- Migrar DeviceRecords de ComputerName (texto) a EquipoId (FK), solo si
-- todavia no se hizo (es decir, si la columna ComputerName sigue existiendo).
IF COL_LENGTH('dbo.DeviceRecords', 'ComputerName') IS NOT NULL
BEGIN
    ALTER TABLE dbo.DeviceRecords ADD EquipoId INT NULL;

    -- Un Equipo por cada ComputerName distinto que ya tenga registros.
    -- CodigoActivo queda igual al ComputerName por ahora (placeholder):
    -- actualizalo despues con el codigo de activo real de cada equipo.
    INSERT INTO dbo.Equipos (CodigoActivo, ComputerName)
    SELECT DISTINCT ComputerName, ComputerName
    FROM dbo.DeviceRecords dr
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.Equipos e WHERE e.ComputerName = dr.ComputerName
    );

    UPDATE dr
    SET dr.EquipoId = e.Id
    FROM dbo.DeviceRecords dr
    JOIN dbo.Equipos e ON e.ComputerName = dr.ComputerName;

    ALTER TABLE dbo.DeviceRecords ALTER COLUMN EquipoId INT NOT NULL;
    ALTER TABLE dbo.DeviceRecords ADD CONSTRAINT FK_DeviceRecords_Equipos
        FOREIGN KEY (EquipoId) REFERENCES dbo.Equipos(Id);

    ALTER TABLE dbo.DeviceRecords DROP COLUMN ComputerName;
END;
