-- CreateTable
CREATE TABLE "Aircraft" (
    "id" SERIAL NOT NULL,
    "icaoHex" TEXT NOT NULL,
    "registration" TEXT,
    "aircraftType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Aircraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flight" (
    "id" SERIAL NOT NULL,
    "aircraftId" INTEGER NOT NULL,
    "callsign" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),

    CONSTRAINT "Flight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlightPosition" (
    "id" SERIAL NOT NULL,
    "flightId" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "altitude" INTEGER,
    "groundSpeed" DOUBLE PRECISION,
    "track" DOUBLE PRECISION,
    "verticalRate" INTEGER,

    CONSTRAINT "FlightPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Aircraft_icaoHex_key" ON "Aircraft"("icaoHex");
CREATE INDEX "Flight_aircraftId_startTime_idx" ON "Flight"("aircraftId", "startTime");
CREATE INDEX "FlightPosition_flightId_recordedAt_idx" ON "FlightPosition"("flightId", "recordedAt");

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FlightPosition" ADD CONSTRAINT "FlightPosition_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
