#target photoshop
app.displayDialogs = DialogModes.NO;
app.bringToFront();

app.preferences.rulerUnits = Units.PIXELS;
app.preferences.typeUnits  = TypeUnits.PIXELS;

/* ================== PATHS ================== */
var PSD_FILE = new File("D:/Zecom AutoAgents/POD Project/3D T shirt/Mockup/PRINT.psd");
var IMG_FILE = new File("D:/Zecom AutoAgents/POD Project/3D T shirt/Mockup/temp.png");
var SO_LAYER_NAME = "REPLACE HERE";
var COLOR_LAYER_NAME = "COLOR";

/* ================== VALIDATE ================== */
if (!PSD_FILE.exists) { alert("PSD/PSB not found:\n" + PSD_FILE.fsName); app.quit(); }
if (!IMG_FILE.exists) { alert("Image not found:\n" + IMG_FILE.fsName); app.quit(); }

/* ================== UTILS ================== */
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

function waitForDocSwitch(oldDoc, timeoutMs) {
    var t = 0;
    var step = 100;
    var max = Math.floor((timeoutMs || 8000) / step);
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

function placeImageAsTopLayerCoverCanvas(doc, file) {
    app.activeDocument = doc;

    var desc = new ActionDescriptor();
    desc.putPath(charIDToTypeID("null"), file);
    desc.putEnumerated(charIDToTypeID("FTcs"), charIDToTypeID("QCSt"), charIDToTypeID("Qcsa"));
    executeAction(charIDToTypeID("Plc "), desc, DialogModes.NO);

    var layer = doc.activeLayer;

    // Move to top (front)
    try { layer.move(doc.layers[0], ElementPlacement.PLACEBEFORE); } catch(e) {}

    // Fit/Cover canvas
    var lb = layer.bounds;
    var lw = lb[2] - lb[0];
    var lh = lb[3] - lb[1];
    var dw = doc.width;
    var dh = doc.height;

    if (lw <= 0 || lh <= 0) return null;

    var scale = Math.max(dw / lw, dh / lh) * 100;
    layer.resize(scale, scale, AnchorPosition.MIDDLECENTER);

    lb = layer.bounds;
    layer.translate(
        (dw - (lb[2] - lb[0])) / 2 - lb[0],
        (dh - (lb[3] - lb[1])) / 2 - lb[1]
    );

    return layer;
}

function deleteAllOtherLayers(doc, keepLayer) {
    app.activeDocument = doc;
    // iterate backwards to safely remove
    for (var i = doc.layers.length - 1; i >= 0; i--) {
        var l = doc.layers[i];
        if (l === keepLayer) continue;
        try { l.remove(); } catch(e) {}
    }
}

function sampleCenterPixelRGB(doc) {
    app.activeDocument = doc;
    var x = doc.width.as("px") / 2;
    var y = doc.height.as("px") / 2;

    doc.colorSamplers.removeAll();
    var s = doc.colorSamplers.add([x, y]);
    var c = s.color.rgb;
    doc.colorSamplers.removeAll();

    // Return plain numbers
    return { r: c.red, g: c.green, b: c.blue };
}

/* ========= COLOR OVERLAY (Layer Style) – PS2026 stable ========= */
function setColorOverlayOnLayer(targetLayer, r, g, b, opacityPercent) {
    try {
        var doc = app.activeDocument;
        doc.activeLayer = targetLayer;

        var desc = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        desc.putReference(charIDToTypeID("null"), ref);

        // Build Layer Effects (Lefx) with Color Overlay (SoFi)
        var fxDesc = new ActionDescriptor();
        fxDesc.putUnitDouble(charIDToTypeID("Scl "), charIDToTypeID("#Prc"), 100.0);

        var colorOverlayDesc = new ActionDescriptor();
        colorOverlayDesc.putBoolean(charIDToTypeID("enab"), true);
        colorOverlayDesc.putEnumerated(charIDToTypeID("Md  "), charIDToTypeID("BlnM"), charIDToTypeID("Nrml"));
        colorOverlayDesc.putUnitDouble(charIDToTypeID("Opct"), charIDToTypeID("#Prc"), opacityPercent);

        var rgbDesc = new ActionDescriptor();
        rgbDesc.putDouble(charIDToTypeID("Rd  "), r);
        rgbDesc.putDouble(charIDToTypeID("Grn "), g);
        rgbDesc.putDouble(charIDToTypeID("Bl  "), b);
        colorOverlayDesc.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), rgbDesc);

        // Attach Color Overlay to layer effects
        fxDesc.putObject(charIDToTypeID("SoFi"), charIDToTypeID("SoFi"), colorOverlayDesc);

        // Apply effects
        desc.putObject(charIDToTypeID("T   "), charIDToTypeID("Lefx"), fxDesc);
        executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);

        return true;
    } catch (e) {
        return false;
    }
}

/* ========= Fallback: set Solid Fill color (only if layer is SOLIDFILL) ========= */
function setSolidFillColor_NoUI(targetLayer, r, g, b) {
    // IMPORTANT: only call this when targetLayer.kind === LayerKind.SOLIDFILL
    app.activeDocument.activeLayer = targetLayer;

    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    desc.putReference(charIDToTypeID("null"), ref);

    var rgbDesc = new ActionDescriptor();
    rgbDesc.putDouble(charIDToTypeID("Rd  "), r);
    rgbDesc.putDouble(charIDToTypeID("Grn "), g);
    rgbDesc.putDouble(charIDToTypeID("Bl  "), b);

    var fillDesc = new ActionDescriptor();
    fillDesc.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), rgbDesc);

    // Set existing fill layer’s color (NO Make)
    desc.putObject(charIDToTypeID("T   "), stringIDToTypeID("solidColorLayer"), fillDesc);
    executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
}

function exportPNG_SameFolder(doc) {
    var outFile = new File(doc.path + "/" + doc.name.replace(/\.[^\.]+$/, ".png"));

    // Prefer SaveForWeb (fast), fallback saveAs PNG
    try {
        var opt = new ExportOptionsSaveForWeb();
        opt.format = SaveDocumentType.PNG;
        opt.PNG8 = false;
        opt.transparency = true;
        opt.interlaced = false;
        opt.quality = 100;
        doc.exportDocument(outFile, ExportType.SAVEFORWEB, opt);
        return;
    } catch (e1) {
        // Fallback PNGSaveOptions
        var pngOpt = new PNGSaveOptions();
        pngOpt.compression = 9;
        pngOpt.interlaced = false;
        doc.saveAs(outFile, pngOpt, true, Extension.LOWERCASE);
    }
}

/* ================== MAIN ================== */
try {
    var outerDoc = app.open(PSD_FILE);

    // Find the smart object layer(s) named REPLACE HERE
    var soLayers = findLayersByName(SO_LAYER_NAME, outerDoc, []);
    if (!soLayers || soLayers.length === 0) throw "Smart Object layer '" + SO_LAYER_NAME + "' not found";

    var sampledRGB = null;

    // Process first match (or loop all matches if you want)
    for (var i = 0; i < soLayers.length; i++) {
        var soLayer = soLayers[i];

        // Must be Smart Object ArtLayer
        if (!soLayer || soLayer.typename !== "ArtLayer" || soLayer.kind !== LayerKind.SMARTOBJECT) continue;

        app.activeDocument = outerDoc;

        // Open smart object
        var replaceDoc = openSmartObjectFromLayer(outerDoc, soLayer);

        // Place image cover canvas
        var insertedLayer = placeImageAsTopLayerCoverCanvas(replaceDoc, IMG_FILE);
        if (!insertedLayer) {
            replaceDoc.close(SaveOptions.DONOTSAVECHANGES);
            app.activeDocument = outerDoc;
            continue;
        }

        // Optional: delete all other layers in smart object (as your algorithm)
        deleteAllOtherLayers(replaceDoc, insertedLayer);

        // Sample center pixel RGB
        sampledRGB = sampleCenterPixelRGB(replaceDoc);

        // Save & close smart object
        replaceDoc.close(SaveOptions.SAVECHANGES);

        app.activeDocument = outerDoc;
        break; // stop after first successful one
    }

    if (!sampledRGB) throw "Could not sample RGB (smart object replace failed)";

    // Set COLOR layer: prefer Color Overlay, fallback solid fill color
    app.activeDocument = outerDoc;
    var colorLayers = findLayersByName(COLOR_LAYER_NAME, outerDoc, []);
    if (!colorLayers || colorLayers.length === 0) throw "Layer '" + COLOR_LAYER_NAME + "' not found";

    for (var c = 0; c < colorLayers.length; c++) {
        var lyr = colorLayers[c];
        if (!lyr || lyr.typename !== "ArtLayer") continue;

        // 1) Try Color Overlay
        var ok = setColorOverlayOnLayer(lyr, sampledRGB.r, sampledRGB.g, sampledRGB.b, 100);

        // 2) Fallback: only if this is Solid Fill layer
        if (!ok && lyr.kind === LayerKind.SOLIDFILL) {
            try { setSolidFillColor_NoUI(lyr, sampledRGB.r, sampledRGB.g, sampledRGB.b); ok = true; } catch(e2) {}
        }
    }

    // Export PNG in same folder
    exportPNG_SameFolder(outerDoc);

    // Close outer doc WITHOUT saving
    outerDoc.close(SaveOptions.DONOTSAVECHANGES);

} catch (err) {
    try {
        while (app.documents.length > 0) {
            app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
        }
    } catch (_) {}
}
forceQuitPhotoshop();
