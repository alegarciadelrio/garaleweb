const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 3000;

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/styles.css', express.static(path.join(__dirname, 'public/styles.css')));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Engine calculations
const engineCalcs = {
    calculateTransferHeight: (stroke, rpm) => {
        // Formula: admission = ((30000 - rpm) / 1000) * (stroke / 100)
        return ((30000 - rpm) / 1000) * (stroke / 100);
    },

    calculateDisplacement: (height, width, rpm, degrees) => {
        // Surface area calculation
        const surface = height * width;
        // K factor calculation
        const K = 22.8 - (((210 - degrees) / 10) * 1.05);
        // Surface time calculation
        const surfaceTime = (height * width * K) / rpm;
        
        return surfaceTime;
    },

    calculateCarburetor: (rpm, cylinder, airSpeed) => {
        // Formula: diameter = (cylinder^(1/3.55)) * sqrt((4 * rpm * cylinder)/(94.25 * airSpeed)) * (1/2.65)
        return (Math.pow(cylinder, 1 / 3.55)) * 
               (Math.sqrt((4 * rpm * cylinder) / (94.25 * airSpeed))) * 
               (1 / 2.65);
    },

    calculateFlapperArea: (carbDiameter) => {
        // Calculate radius from diameter
        const radius = carbDiameter / 2;
        // Calculate carburetor area
        const carbArea = Math.PI * Math.pow(radius, 2);
        // Calculate flapper area (90% of carburetor area)
        return carbArea * 0.90;
    },

    calculateCompressionRatio: (cylinderVolume, chamberVolume) => {
        // Formula: rc = (cylinderVolume + chamberVolume) / chamberVolume
        return (cylinderVolume + chamberVolume) / chamberVolume;
    },

    calculateCylinderLidDown: (carrera, compresion, compresionDeseada) => {
        // Formula: rebajeTapa = ((carrera)/(compresion-1)-((carrera)/(compresionDeseada-1)))
        return (carrera / (compresion - 1)) - (carrera / (compresionDeseada - 1));
    },

    calculateExhaust: (angulo, angulo2, areaEscape, rpm, escape, factorBajada) => {
        const pi = Math.PI;
        
        // Calculate total length
        const Lt = (escape * 1700) / rpm;
        
        // Calculate cotangents
        const cotA1 = 1 / Math.tan(angulo * Math.PI / 180);
        const cotA2 = 1 / Math.tan(angulo2 * Math.PI / 180);
        
        // Calculate diameters
        const De = Math.sqrt(areaEscape / pi) * 2;
        const D1 = De * 1.3;
        const D2 = Math.sqrt(Math.pow(D1, 2) * 6.25);
        const D3 = D1 * 0.62;
        
        // Calculate lengths
        const L2 = (D2 / 2) * cotA2;
        const L1 = Lt - (L2 / 2);
        const L3 = D1 * factorBajada;
        const L4 = ((D2 - D1) / 2) * (cotA1 * 2);
        const L5 = L1 - (L3 + L4);
        const L6 = ((D2 - D3) / 2) * cotA2;
        const L7 = D3 * 12;
        
        return {
            De, D1, D2, D3,
            L1, L2, L3, L4, L5, L6, L7,
            Lt
        };
    },

    calculateYEIS: (largo, diametro, rpm, velSonido) => {
        const pi = Math.PI;
        
        // Formula: volumen = (Math.pow((diametro/20),2)*pi / (Math.pow(((rpm/60)*2*pi / (velSonido*100)),2) * (largo+1.57 * (diametro/20))))
        const volumen = (Math.pow((diametro/20), 2) * pi) / 
                       (Math.pow(((rpm/60) * 2 * pi / (velSonido * 100)), 2) * 
                       (largo + 1.57 * (diametro/20)));
        
        return volumen;
    }
};

const calculationConfig = {
    transfer_height: {
        title: 'Optimal Transfer Height',
        unit: 'mm',
        calculate: (params) => engineCalcs.calculateTransferHeight(params.stroke, params.maxRPM)
    },
    displacement: {
        title: 'Surface Time',
        unit: 'ms',
        calculate: (params) => engineCalcs.calculateDisplacement(params.height, params.width, params.rpm_displacement, params.degrees)
    },
    carburetor: {
        title: 'Optimal Carburetor Size',
        unit: 'mm',
        calculate: (params) => engineCalcs.calculateCarburetor(params.rpm_carb, params.cylinder, params.airSpeed)
    },
    flapper: {
        title: 'Optimal Flapper Area',
        unit: 'mm²',
        calculate: (params) => engineCalcs.calculateFlapperArea(params.carbDiameter)
    },
    compression: {
        title: 'Compression Ratio',
        unit: ':1',
        calculate: (params) => engineCalcs.calculateCompressionRatio(params.cylinderVolume, params.chamberVolume)
    },
    cylinder_lid: {
        title: 'Cylinder Lid Down',
        unit: 'mm',
        calculate: (params) => engineCalcs.calculateCylinderLidDown(params.carrera, params.compresion, params.compresionDeseada)
    },
    exhaust: {
        title: 'Exhaust Dimensions',
        unit: 'mm',
        calculate: (params) => engineCalcs.calculateExhaust(
            params.angulo,
            params.angulo2,
            params.areaEscape,
            params.rpm_exhaust,
            params.escape,
            params.factorBajada
        )
    },
    yeis: {
        title: 'YEIS Volume',
        unit: 'cc',
        calculate: (params) => engineCalcs.calculateYEIS(
            params.largo,
            params.diametro,
            params.rpm_yeis,
            params.velSonido
        )
    }
};

// Routes
app.get('/', (req, res) => {
    try {
        console.log('Rendering index page');
        res.render('index');
    } catch (err) {
        console.error('Error rendering index:', err);
        next(err);
    }
});

app.post('/calculate', (req, res, next) => {
    try {
        console.log('Calculating:', req.body);
        const {
            calculation,
            stroke,
            maxRPM,
            height,
            width,
            rpm_displacement,
            rpm_carb,
            rpm_exhaust,
            rpm_yeis,
            degrees,
            cylinder,
            airSpeed,
            carbDiameter,
            cylinderVolume,
            chamberVolume,
            carrera,
            compresion,
            compresionDeseada,
            angulo,
            angulo2,
            areaEscape,
            escape,
            factorBajada,
            largo,
            diametro,
            velSonido
        } = req.body;

        // Convert string inputs to numbers based on calculation type
        const params = {
            stroke: parseFloat(stroke),
            maxRPM: parseFloat(maxRPM),
            height: parseFloat(height),
            width: parseFloat(width),
            rpm_displacement: parseFloat(rpm_displacement),
            rpm_carb: parseFloat(rpm_carb),
            rpm_exhaust: parseFloat(rpm_exhaust),
            rpm_yeis: parseFloat(rpm_yeis),
            degrees: parseFloat(degrees),
            cylinder: parseFloat(cylinder),
            airSpeed: parseFloat(airSpeed),
            carbDiameter: parseFloat(carbDiameter),
            cylinderVolume: parseFloat(cylinderVolume),
            chamberVolume: parseFloat(chamberVolume),
            carrera: parseFloat(carrera),
            compresion: parseFloat(compresion),
            compresionDeseada: parseFloat(compresionDeseada),
            angulo: parseFloat(angulo),
            angulo2: parseFloat(angulo2),
            areaEscape: parseFloat(areaEscape),
            escape: parseFloat(escape),
            factorBajada: parseFloat(factorBajada),
            largo: parseFloat(largo),
            diametro: parseFloat(diametro),
            velSonido: parseFloat(velSonido)
        };

        const config = calculationConfig[calculation];
        const result = config.calculate(params);

        let results;
        if (calculation === 'exhaust') {
            results = {
                title: config.title,
                values: {
                    'De (Diameter)': result.De.toFixed(2),
                    'D1': result.D1.toFixed(2),
                    'D2': result.D2.toFixed(2),
                    'D3': result.D3.toFixed(2),
                    'L1': result.L1.toFixed(2),
                    'L2': result.L2.toFixed(2),
                    'L3': result.L3.toFixed(2),
                    'L4': result.L4.toFixed(2),
                    'L5': result.L5.toFixed(2),
                    'L6': result.L6.toFixed(2),
                    'L7': result.L7.toFixed(2),
                    'Total Length (Lt)': result.Lt.toFixed(2)
                },
                unit: config.unit
            };
        } else {
            results = {
                title: config.title,
                value: result.toFixed(2),
                unit: config.unit
            };
        }

        console.log('Rendering results:', results);
        res.render('results', { results });
    } catch (err) {
        console.error('Error calculating:', err);
        next(err);
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
