#target photoshop
app.displayDialogs = DialogModes.NO;
app.bringToFront();

app.preferences.rulerUnits = Units.PIXELS;
app.preferences.typeUnits  = TypeUnits.PIXELS;

/* ================== PATHS ================== */
var PSD_FILE = new File("D:/Zecom AutoAgents/zecom3d/3D T shirt/3D T shirt/Mockup/Mockup.psd");
var IMG_FILE = new File("D:/Zecom AutoAgents/zecom3d/3D T shirt/3D T shirt/Mockup/PRINT.png");
var SO_LAYER_NAME = "REPLACE HERE";

/* ================== VALIDATE ================== */
if (!PSD_FILE.exists || !IMG_FILE.exists) {
    app.quit();
}

/* ================== UTILS ================== */
function waitForDocSwitch(oldDoc, timeoutMs) {
    var t = 0;
    var step = 100;
    var max = Math.floor((timeoutMs || 10000) / step);
    while (app.activeDocument === oldDoc) {
        $.sleep(step);
        if (++t > max) throw "Document switch timeout";
    }
}

function findLayersByName(name, parent, outArr) {
    outArr = outArr || [];
    parent = parent || app.activeDocument;
    for (var i = 0; i < parent.layers.length; i++) {
        var l = parent.layers[i];
        if (l.name === name) outArr.push(l);
        if (l.typename === "LayerSet") findLayersByName(name, l, outArr);
    }
    return outArr;
}

function openSmartObjectFromLayer(doc, soLayer) {
    doc.activeLayer = soLayer;
    executeAction(stringIDToTypeID("placedLayerEditContents"), undefined, DialogModes.NO);
    waitForDocSwitch(doc, 12000);
    return app.activeDocument;
}

function placeImageAsTopLayer_NO_RESIZE(doc, file) {
    app.activeDocument = doc;

    var desc = new ActionDescriptor();
    desc.putPath(charIDToTypeID("null"), file);
    desc.putEnumerated(charIDToTypeID("FTcs"), charIDToTypeID("QCSt"), charIDToTypeID("Qcsa"));
    executeAction(charIDToTypeID("Plc "), desc, DialogModes.NO);

    var layer = doc.activeLayer;

    // Move to top only
    try { layer.move(doc.layers[0], ElementPlacement.PLACEBEFORE); } catch(e) {}

    return layer;
}

function exportPNG_SameFolder(doc) {
    var outFile = new File(doc.path + "/" + doc.name.replace(/\.[^\.]+$/, ".png"));

    try {
        var opt = new ExportOptionsSaveForWeb();
        opt.format = SaveDocumentType.PNG;
        opt.PNG8 = false;
        opt.transparency = true;
        opt.interlaced = false;
        opt.quality = 100;
        doc.exportDocument(outFile, ExportType.SAVEFORWEB, opt);
    } catch (e) {
        var pngOpt = new PNGSaveOptions();
        pngOpt.compression = 9;
        pngOpt.interlaced = false;
        doc.saveAs(outFile, pngOpt, true, Extension.LOWERCASE);
    }
}

function forceQuitPhotoshop() {
    try {
        while (app.documents.length > 0) {
            app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
        }
    } catch (e) {}

    try {
        executeAction(charIDToTypeID("quit"), undefined, DialogModes.NO);
    } catch (e2) {}

    try { app.quit(); } catch (e3) {}
}

/* ================== MAIN ================== */
try {
    var outerDoc = app.open(PSD_FILE);

    var soLayers = findLayersByName(SO_LAYER_NAME, outerDoc, []);
    if (!soLayers || soLayers.length === 0)
        throw "Smart Object layer not found";

    for (var i = 0; i < soLayers.length; i++) {
        var soLayer = soLayers[i];
        if (!soLayer || soLayer.typename !== "ArtLayer" || soLayer.kind !== LayerKind.SMARTOBJECT)
            continue;

        app.activeDocument = outerDoc;

        var replaceDoc = openSmartObjectFromLayer(outerDoc, soLayer);

        placeImageAsTopLayer_NO_RESIZE(replaceDoc, IMG_FILE);

        // Ctrl + S immediately, no adjustments
        replaceDoc.close(SaveOptions.SAVECHANGES);

        app.activeDocument = outerDoc;
        break;
    }

    exportPNG_SameFolder(outerDoc);
    outerDoc.close(SaveOptions.DONOTSAVECHANGES);

} catch (err) {
    try {
        while (app.documents.length > 0) {
            app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
        }
    } catch (_) {}
}

forceQuitPhotoshop();
