-- Ejecutar una sola vez sobre la base de datos, desde el "Editor de consultas" (Query editor)
-- de Azure Portal (dentro del recurso de la base SQL) o desde Azure Data Studio / SSMS.

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
