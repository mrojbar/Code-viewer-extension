const vscode = acquireVsCodeApi();

// Exposed globally so inline event handlers (onchange) can trigger them
window.updateSetting = function (key, value, type) {
  if (type === "number") {
    value = parseFloat(value);
  }
  vscode.postMessage({ command: "updateSetting", key, value });
};

window.syncSliderAndInput = function (key) {
  const slider = document.getElementById(key + "-slider");
  const input = document.getElementById(key + "-input");
  input.value = slider.value;
};

window.syncInputAndSlider = function (key) {
  const slider = document.getElementById(key + "-slider");
  const input = document.getElementById(key + "-input");

  // Validate limits
  let val = parseFloat(input.value);
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);

  if (val < min) {
    val = min;
  }
  if (val > max) {
    val = max;
  }

  input.value = val;
  slider.value = val;

  window.commitNumber(key);
};

window.commitNumber = function (key) {
  const val = document.getElementById(key + "-input").value;
  window.updateSetting(key, val, "number");
};
