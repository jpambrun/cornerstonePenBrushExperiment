(function () {
  // add enable/disable to simpleMouseTool
  // TODO: handle CornerstoneNewImage
  function mouseButtonTool(pointerDownCallback, mouseWheelCallback, activateCallback, deactivateCallback, imageRenderedCallback) {
    let configuration = {};

    const toolInterface = {

      enable(element) {
        activateCallback(element);
        $(element).on('cornerstoneimagerendered', imageRenderedCallback);
      },
      disable(element) {
        this.deactivate(element)
        $(element).off('cornerstoneimagerendered', imageRenderedCallback);
        deactivateCallback(element);
      },
      activate(element, mouseButtonMask, options) {
        configuration.mouseButtonMask = mouseButtonMask;
        element.addEventListener('pointerdown', pointerDownCallback);
        element.addEventListener('cornerstonetoolsmousewheel', mouseWheelCallback);
      },
      deactivate(element) {
        element.removeEventListener('pointerdown', pointerDownCallback);
        element.removeEventListener('cornerstonetoolsmousewheel', mouseWheelCallback);
      },
      getConfiguration() {
        return configuration;
      },
      setConfiguration(config) {
        configuration = config;
      }
    };

    return toolInterface;
  }


  //  ====================   tool def  ===========================
  const TOOL_NAME = 'svgBrush';
  const touchEventCache = new Map();

  const defaultConfiguration = {
    radius: 10,
    segmentationIndex: 0,
    segmentationColors: ['#bada55', '#55daba', '#ba55da'],
    pinchToZoom: true,
    simplifyPrecision : 0.4,
  };

  const isMouseButtonEnabled = cornerstoneTools.isMouseButtonEnabled;

  function setCursor(data, radius) {
    if (data.currentCursor.radius === radius) {
      return radius;
    }

    if (radius === undefined) {
      window.URL.revokeObjectURL(data.currentCursor.url);
      data.currentCursor.url = undefined;
      document.getElementById(data.svgElementId).style.cursor = `auto`;
      return;
    }

    if (radius > 32) {
      radius = 32;
    } else if (radius < 3) {
      radius = 3;
    } else {
      radius = radius | 0;
    }

    if (data.currentCursor.url) {
      window.URL.revokeObjectURL(data.currentCursor.url);
      data.currentCursor.url = undefined;
    }

    let cursorBlob = new Blob([
      `<svg xmlns="http://www.w3.org/2000/svg" width="${radius * 2 + 1}" height="${radius * 2 + 1}">
          <circle cx="${radius}" cy="${radius}" r="${radius}" stroke="#000000" fill="gray" style="opacity: 0.5; stroke-width: 1;"/>
       </svg>`], { type: 'image/svg+xml' });
    data.currentCursor.url = window.URL.createObjectURL(cursorBlob);
    document.getElementById(data.svgElementId).style.cursor = `url('${data.currentCursor.url}') ${radius} ${radius}, auto`;
    data.currentCursor.radius = radius;
    return radius;
  }

  function createRegion(p1, p2, radius) {
    const polygon = [];
    const steps = 16;
    if (p2 && (p1.x > p2.x || (p1.x === p2.x && p1.y > p2.y))) {
      const tmp = p1;
      p1 = p2;
      p2 = tmp;
    }

    const startAngle = p2 ? Math.PI / 2 + Math.atan2((p2.y - p1.y), (p2.x - p1.x)) : 0;

    // first half circle
    for (var i = 0; i < steps / 2; i++) {
      const angle = startAngle + 2 * Math.PI * i / steps;
      x = (p1.x + radius * Math.cos(angle));
      y = (p1.y + radius * Math.sin(angle));
      polygon.push([x, y]);
    }

    // second half circle
    for (var i = steps / 2; i < steps; i++) {
      const angle = startAngle + 2 * Math.PI * i / steps;
      x = ((p2 ? p2 : p1).x + radius * Math.cos(angle));
      y = ((p2 ? p2 : p1).y + radius * Math.sin(angle));
      polygon.push([x, y]);
    }
    return polygon;
  }

  function paintRegion(data, segmentationIndex, polygon) {
    if (!data.segmentations[segmentationIndex]) {
      data.segmentations[segmentationIndex] = { regions: [polygon] };
    } else {
      const seg = data.segmentations[segmentationIndex];

      if (data.removeMode) {
        // perform substrations
        for (let i = 0, len = seg.regions.length; i < len; i++) {
          const result = PolygonTools.polygon.subtract(seg.regions[i], polygon);
          seg.regions[i] = result.pop();
          seg.regions = seg.regions.concat(result);
        }
      } else {
        // perform union
        seg.regions = PolygonTools.polygon.union(polygon, ...seg.regions);
      }

      // remove holes and empty now regions
      seg.regions = seg.regions.filter(r => r && PolygonTools.polygon.is_ccw(r));
    }
  }

  function imageRenderedCallback(e) {
    const config = svgBrush.getConfiguration();
    const data = cornerstoneTools.getToolState(e.detail.element, TOOL_NAME).data[0];
    config.radius = setCursor(data, config.radius);
    draw(e.detail.element, config, data);
  }

  function draw(element, config, data) {
    const svgElement = document.getElementById('svg');

    // clear the svg

    // TODO: add ability to remove segmentations

    const paths = Array.from(svgElement.children);
    data.segmentations.forEach((seg, index) => {
      let pathString = '';
      // imagePoint = cornerstoneTools.projectPatientPointToImagePlane(point, data.imagePlaneModule);
      seg.regions.forEach(region => {
        const canvasRegion = region.map(p => {
          const canvasPoint = cornerstone.pixelToCanvas(element, { x: p[0], y: p[1] });
          return [canvasPoint.x | 0, canvasPoint.y | 0];
        });

        pathString += `M${canvasRegion[0][0]},${canvasRegion[0][1]},`;
        for (let i = 1; i < canvasRegion.length; i++) {
          pathString += `L${canvasRegion[i][0]},${canvasRegion[i][1]},`;
        }
        pathString += `L${canvasRegion[0][0]},${canvasRegion[0][1]},`;

      });
      if (paths.length <= index) {
        const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathElement.setAttributeNS(null, "d", pathString);
        pathElement.setAttributeNS(null, "stroke", "#000");
        pathElement.setAttributeNS(null, "stroke-width", 1);
        pathElement.setAttributeNS(null, "opacity", 0.5);
        pathElement.setAttributeNS(null, "fill", config.segmentationColors[index]);
        svgElement.appendChild(pathElement);
        paths.push(pathElement);
      }
      paths[index].setAttributeNS(null, "d", pathString);

    });
  }

  function pointerUpCallback(e) {
    const element = e.currentTarget;
    element.releasePointerCapture(e.pointerId);
    const config = svgBrush.getConfiguration();

    if (config.pinchToZoom && e.pointerType === 'touch') {
      touchEventCache.delete(e.pointerId);
      if (touchEventCache.size === 0) {
        element.removeEventListener('pointermove', dragCallback);
        element.removeEventListener('pointerup', pointerUpCallback);
        element.removeEventListener('pointercancel', pointerUpCallback);
        element.removeEventListener('pointerout', pointerUpCallback);
        element.removeEventListener('pointerleave', pointerUpCallback);
      }
      return;
    }

    const data = cornerstoneTools.getToolState(element, TOOL_NAME).data[0];
    const seg = data.segmentations[config.segmentationIndex];
    for (let i = 0; i < seg.regions.length; i++) {
      seg.regions[i] = simplify(seg.regions[i], config.simplifyPrecision, true);
    }

    draw(element, config, data);

    element.removeEventListener('pointermove', dragCallback);
    element.removeEventListener('pointerup', pointerUpCallback);
  }

  function pointerDownCallback(e) {
    const element = e.currentTarget;
    element.setPointerCapture(e.pointerId);
    const config = svgBrush.getConfiguration();
    if (!config) {
      return;
    }

    if (config.pinchToZoom && e.pointerType === 'touch') {
      touchEventCache.set(e.pointerId, e);
      element.addEventListener('pointermove', dragCallback);
      element.addEventListener('pointerup', pointerUpCallback);
      element.addEventListener('pointercancel', pointerUpCallback);
      // element.addEventListener('pointerout', pointerUpCallback);
      element.addEventListener('pointerleave', pointerUpCallback);
      return;
    }

    if (isMouseButtonEnabled(e.buttons, config.mouseButtonMask)) {
      const data = cornerstoneTools.getToolState(element, TOOL_NAME).data[0];
      const enabledElement = cornerstone.getEnabledElement(element);
      const scale = enabledElement.transform ? enabledElement.transform.m[0] : enabledElement.viewport.scale;
      data.removeMode = !!e.ctrlKey;

      const currentImagePoint = cornerstone.canvasToPixel(element, { x: e.offsetX, y: e.offsetY });

      // const patientPoint = cornerstoneTools.imagePointToPatientPoint(currentImagePoint, data.imagePlaneModule)
      const radius = e.pointerType === 'pen' ? Math.max((e.pressure - .3) * 40, 5) : config.radius
      const region = createRegion(currentImagePoint, undefined, radius / scale);

      paintRegion(data, config.segmentationIndex, region);
      draw(element, config, data);

      element.addEventListener('pointermove', dragCallback);
      element.addEventListener('pointerup', pointerUpCallback);
      return;
    }
  }

  function dragCallback(e) {
    const element = e.currentTarget;
    const currentImagePoint = cornerstone.canvasToPixel(element, { x: e.offsetX, y: e.offsetY });
    const config = svgBrush.getConfiguration();
    if (config.pinchToZoom && e.pointerType === 'touch') {
      touchEventCache.set(e.pointerId, e);
      let deltaTransform;
      if (touchEventCache.size === 1) {
        const lastPoint1 = { x: e.offsetX - e.movementX, y: e.offsetY - e.movementY };
        const currPoint1 = { x: e.offsetX, y: e.offsetY };
        const domain = [[lastPoint1.x, lastPoint1.y]];
        const range = [[currPoint1.x, currPoint1.y]];
        deltaTransform = nudged.estimateT(domain, range);


      }
      if (touchEventCache.size === 2) {
        const [e1, e2] = touchEventCache.values();
        const lastPoint1 = { x: e1.offsetX - (e.pointerId === e1.pointerId ? e1.movementX : 0), y: e1.offsetY - (e.pointerId === e1.pointerId ? e1.movementY : 0) };
        const lastPoint2 = { x: e2.offsetX - (e.pointerId === e2.pointerId ? e2.movementX : 0), y: e2.offsetY - (e.pointerId === e2.pointerId ? e2.movementY : 0) };
        const currPoint1 = { x: e1.offsetX, y: e1.offsetY };
        const currPoint2 = { x: e2.offsetX, y: e2.offsetY };
        const domain = [[lastPoint1.x, lastPoint1.y], [lastPoint2.x, lastPoint2.y]];
        const range = [[currPoint1.x, currPoint1.y], [currPoint2.x, currPoint2.y]];
        deltaTransform = nudged.estimateTSR(domain, range);
      }

      if (deltaTransform) {
        const enabledElement = cornerstone.getEnabledElement(element)
        const m = cornerstone.internal.getTransform(enabledElement).m;
        let transform = new nudged.Transform(m[0], m[1], m[4], m[5]);

        transform = deltaTransform.multiplyBy(transform);

        const mt = transform.getMatrix();

        const t = new cornerstone.internal.Transform();
        t.m = [mt.a, mt.b, mt.c, mt.d, mt.e, mt.f];
        enabledElement.transform = t;

        cornerstone.updateImage(element);

      }
      return;
    }

    const data = cornerstoneTools.getToolState(element, TOOL_NAME).data[0];
    const lastImagePoint = cornerstone.canvasToPixel(element, { x: e.offsetX - e.movementX, y: e.offsetY - e.movementY });
    const enabledElement = cornerstone.getEnabledElement(element);
    const scale = enabledElement.transform ? enabledElement.transform.m[0] : enabledElement.viewport.scale;
    const radius = e.pointerType === 'pen' ? Math.max((e.pressure - .3) * 40, 5) : config.radius
    const region = createRegion(currentImagePoint, lastImagePoint, radius / scale);

    paintRegion(data, config.segmentationIndex, region);
    draw(element, config, data);
  }


  function mouseWheelCallback(e) {
    const element = e.currentTarget;
    if (e.shiftKey) {
      const data = cornerstoneTools.getToolState(element, TOOL_NAME).data[0];
      const config = svgBrush.getConfiguration();
      const newRadius = config.radius + e.detail.direction * Math.ceil(config.radius / 20);
      config.radius = setCursor(data, newRadius);
      return false;
    }
  }

  function pointerenterCallback(e) {
    const element = e.currentTarget;
    const data = cornerstoneTools.getToolState(element, TOOL_NAME).data[0];

    if (e.pointerType !== 'mouse') {
      setCursor(data, undefined)
      return;
    }

    const config = svgBrush.getConfiguration();
    config.radius = setCursor(data, config.radius);
  }

  function activateCallback(element) {
    let config = svgBrush.getConfiguration();
    const enabledElement = cornerstone.getEnabledElement(element);
    if (!config.radius) {
      Object.assign(config, defaultConfiguration)
    }

    let data = cornerstoneTools.getToolState(element, TOOL_NAME);
    if (!data) {
      data = {
        segmentations: [],
        imagePlaneModule: enabledElement.image.imagePlaneModule,
        removeMode: false,
        currentCursor: {
          url: undefined,
          radius: undefined,
        },
        svgElementId: 'svg',
      }
      cornerstoneTools.addToolState(element, TOOL_NAME, data);
    }

    config.radius = setCursor(data, config.radius);
    element.addEventListener('pointerenter', pointerenterCallback);
  }

  function deactivateCallback(element) {
    const data = cornerstoneTools.getToolState(element, TOOL_NAME).data[0];
    setCursor(data, undefined);
    element.removeEventListener('pointerenter', pointerenterCallback);
  }

  const svgBrush = mouseButtonTool(pointerDownCallback, mouseWheelCallback, activateCallback, deactivateCallback, imageRenderedCallback);
  cornerstoneTools.svgBrush = svgBrush;
})();
