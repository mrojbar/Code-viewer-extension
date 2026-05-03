window.vscodeApi = window.vscodeApi || acquireVsCodeApi();

function updateModifiedIndicator(key, value) {
  const row = document.querySelector(`.setting-row[data-key="${key}"]`);
  if (!row) {
    return;
  }
  const defaultVal = row.getAttribute("data-default");
  const isConfigured = String(value) !== String(defaultVal);
  row.classList.toggle("is-configured", isConfigured);
}

document.addEventListener("click", (e) => {
  const resetBtn = e.target.closest(".settings-reset-btn");
  if (resetBtn) {
    window.vscodeApi.postMessage({ command: "resetSettings" });
  }
});

window.updateSetting = function (key, value, type) {
  if (type === "number") {
    value = parseFloat(value);
  }
  window.vscodeApi.postMessage({ command: "updateSetting", key, value });
  updateModifiedIndicator(key, value);
};

window.syncSliderAndInput = function (key) {
  const slider = document.getElementById(key + "-slider");
  const input = document.getElementById(key + "-input");
  input.value = slider.value;
  updateModifiedIndicator(key, slider.value);
};

window.syncInputAndSlider = function (key) {
  const slider = document.getElementById(key + "-slider");
  const input = document.getElementById(key + "-input");

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
  updateModifiedIndicator(key, val);
  window.commitNumber(key);
};

window.commitNumber = function (key) {
  const val = document.getElementById(key + "-input").value;
  window.updateSetting(key, val, "number");
};
