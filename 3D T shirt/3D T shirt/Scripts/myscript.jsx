#target photoshop
app.displayDialogs = DialogModes.NO;
app.bringToFront();

function main() {
    var designFile = new File("D:/Zecom AutoAgents/POD Project/Youth T-shirt Gildan 5000B/Mockup/Image_0_exported.png");
    if (!designFile.exists) return;

    var psdFile = new File("D:/Zecom AutoAgents/POD Project/Youth T-shirt Gildan 5000B/Mockup/File Xuất Ảnh.psd");
    if (!psdFile.exists) return;

    var doc = app.open(psdFile);
    var exportFolder = psdFile.parent.fsName;
    var baseName = "Image_0_exported";

    // 1. Thay ảnh vào layer "REPLACE"
    replaceInReplaceLayer("REPLACE", designFile.absoluteURI);

    // 2. Xuất đúng 6 layer theo thứ tự (dù nằm trong group)
    exportSixLayers(doc, exportFolder, baseName);

    doc.close(SaveOptions.DONOTSAVECHANGES);

    // TẮT HOÀN TOÀN PHOTOSHOP (không hiện alert, không treo)
    forceQuitPhotoshop();
}

// THAY ẢNH VÀO "REPLACE" – đã fix 100%
function replaceInReplaceLayer(layerName, imagePath) {
    var layers = getAllLayersByName(app.activeDocument, layerName);
    if (layers.length == 0) return;

    var layer = layers[0];
    if (layer.kind !== LayerKind.SMARTOBJECT) return;

    app.activeDocument.activeLayer = layer;
    executeAction(stringIDToTypeID("placedLayerEditContents"), undefined, DialogModes.NO);
    var smartDoc = app.activeDocument;

    // Ẩn hết layer cũ
    for (var i = 0; i < smartDoc.layers.length; i++) smartDoc.layers[i].visible = false;

    // Chèn ảnh mới lên trên cùng
    var temp = app.open(new File(imagePath));
    var newLayer = temp.layers[0].duplicate(smartDoc, ElementPlacement.PLACEATBEGINNING);
    temp.close(SaveOptions.DONOTSAVECHANGES);

    newLayer.visible = true;

    // Fit + căn giữa chuẩn
    var w = smartDoc.width.as("px"), h = smartDoc.height.as("px");
    var b = newLayer.bounds;
    var lw = b[2].value - b[0].value;
    var lh = b[3].value - b[1].value;
    if (lw > 0 && lh > 0) {
        var scale = Math.min(w/lw, h/lh) * 100;
        newLayer.resize(scale, scale, AnchorPosition.MIDDLECENTER);
        b = newLayer.bounds;
        var dx = (w - (b[2].value - b[0].value))/2 - b[0].value;
        var dy = (h - (b[3].value - b[1].value))/2 - b[1].value;
        newLayer.translate(dx, dy);
    }

    smartDoc.close(SaveOptions.SAVECHANGES);
}

// XUẤT ĐÚNG 6 LAYER THEO THỨ TỰ
function exportSixLayers(doc, folder, baseName) {
    var names = ["REPLACE", "Image_1", "Image_2", "Image_3", "Image_4", "Image_5"];

    for (var i = 0; i < names.length; i++) {
        var layer = getAllLayersByName(doc, names[i])[0];
        if (!layer) continue;

        // Bật layer cần xuất, ẩn hết các layer khác
        hideAllLayers(doc);
        layer.visible = true;

        var num = ("00" + (i+1)).slice(-3);
        var filePath = folder + "/" + baseName + "-" + num + ".jpg";

        var opt = new ExportOptionsSaveForWeb();
        opt.format = SaveDocumentType.JPEG;
        opt.quality = 100;
        opt.optimized = true;

        doc.exportDocument(new File(filePath), ExportType.SAVEFORWEB, opt);
    }

    // Bật lại tất cả layer (tùy chọn)
    showAllLayers(doc);
}

// ẨN TẤT CẢ LAYER
function hideAllLayers(doc) {
    for (var i = 0; i < doc.layers.length; i++) {
        doc.layers[i].visible = false;
    }
}
function showAllLayers(doc) {
    for (var i = 0; i < doc.layers.length; i++) {
        doc.layers[i].visible = true;
    }
}

// TÌM LAYER CHUẨN (dù nằm trong group sâu mấy cũng thấy)
function getAllLayersByName(parent, name) {
    var result = [];
    for (var i = 0; i < parent.layers.length; i++) {
        var layer = parent.layers[i];
        if (layer.name === name) result.push(layer);
        if (layer.typename === "LayerSet") {
            result = result.concat(getAllLayersByName(layer, name));
        }
    }
    return result;
}

// TẮT PHOTOSHOP HOÀN TOÀN (không hiện alert, không treo)
function forceQuitPhotoshop() {
    var idQuit = charIDToTypeID("quit");
    var desc = new ActionDescriptor();
    desc.putBoolean(charIDToTypeID("Svng"), false); // không hỏi save
    executeAction(idQuit, desc, DialogModes.NO);
}

// CHẠY NGAY
main();