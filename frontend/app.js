/* =========================================================
   SANKET SETU AI — PREMIUM INTERACTIVE CONTROLLER
   ---------------------------------------------------------
   Features:
   • Full 21-point hand landmarks
   • Two-hand tracking
   • Animated landmark glow
   • Motion trails
   • Thin neon skeleton
   • Accessibility HUD
   • Sign → Orchestrator
   • Teach My Signs calibration
   • Light / Dark theme
   • Voice / Text / Document
========================================================= */

const API = "http://127.0.0.1:8000";

const $ = id => document.getElementById(id);

let stream = null;
let teachStream = null;

let signTimer = null;
let teachTimer = null;

let signFrames = [];
let teachFrames = [];

let lastLandmarks = {
    left: [],
    right: []
};

let animatedLandmarks = {
    left: [],
    right: []
};

let previousLandmarks = {
    left: [],
    right: []
};

let landmarkTrails = {
    left: [],
    right: []
};

let last = {
    label: "",
    confidence: 0
};

let calibration = {
    labels: {},
    totalSamples: 0
};

let recognition = null;
let voiceText = "";

const N = 32;
const FEATURE_SIZE = 168;

const LANDMARK_COUNT = 21;

const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],

    [5, 9],
    [9, 13],
    [13, 17],
    [0, 17]
];


/* =========================================================
   PAGE NAVIGATION
========================================================= */

function go(pageName) {

    console.log("NAVIGATE:", pageName);

    document.querySelectorAll(".page").forEach(page => {
        page.classList.remove("active");
    });

    const target = $(pageName);

    if (!target) {
        console.error("PAGE NOT FOUND:", pageName);
        toast("Page not found: " + pageName);
        return;
    }

    target.classList.add("active");

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    if (pageName !== "sign") {
        stopSignCamera();
    }

    if (pageName !== "teach") {
        stopTeachCamera();
    }

    if (pageName === "sign") {
        loadModelInfo();
        ensureAccessibilityHUD("sign");
    }

    if (pageName === "teach") {
        loadCalibrationStatus();
        ensureAccessibilityHUD("teach");
    }

}


/* =========================================================
   NAVIGATION
========================================================= */

document.addEventListener("click", event => {

    const button = event.target.closest("[data-go]");

    if (!button) return;

    const page = button.getAttribute("data-go");

    if (!page) return;

    go(page);

});


/* =========================================================
   TOAST
========================================================= */

function toast(message) {

    const el = $("toast");

    if (!el) return;

    el.textContent = message;

    el.classList.add("show");

    clearTimeout(el._timer);

    el._timer = setTimeout(() => {
        el.classList.remove("show");
    }, 2800);

}


/* =========================================================
   THEME
========================================================= */

function applyTheme(theme) {

    const light = theme === "light";

    document.body.classList.toggle("light", light);

    localStorage.setItem(
        "sanket-theme",
        light ? "light" : "dark"
    );

    const button = $("theme");

    if (button) {
        button.textContent = light ? "☾" : "☼";
        button.setAttribute(
            "aria-label",
            light ? "Switch to dark mode" : "Switch to light mode"
        );
    }

    updateCanvasTheme();

}


const savedTheme =
    localStorage.getItem("sanket-theme") || "dark";

applyTheme(savedTheme);


if ($("theme")) {

    $("theme").onclick = () => {

        const light =
            document.body.classList.contains("light");

        applyTheme(
            light ? "dark" : "light"
        );

    };

}


/* =========================================================
   CANVAS THEME
========================================================= */

function updateCanvasTheme() {

    const light =
        document.body.classList.contains("light");

    document.documentElement.style.setProperty(
        "--landmark-main",
        light ? "#087cff" : "#00eaff"
    );

    document.documentElement.style.setProperty(
        "--landmark-secondary",
        light ? "#6b4cff" : "#8b5cff"
    );

}


/* =========================================================
   CAMERA
========================================================= */

async function camera(kind) {

    try {

        const isTeach =
            kind === "teach";

        const video =
            isTeach ? $("tvideo") : $("video");

        const placeholder =
            isTeach
                ? $("tplaceholder")
                : $("placeholder");

        if (!video) {
            toast("Camera element not found.");
            return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {

            toast(
                "Camera is not supported in this browser."
            );

            return;
        }

        const media =
            await navigator.mediaDevices.getUserMedia({

                video: {
                    width: {
                        ideal: 1280
                    },

                    height: {
                        ideal: 720
                    },

                    facingMode: "user"
                },

                audio: false

            });


        video.srcObject = media;

        await video.play();

        if (placeholder) {
            placeholder.style.display = "none";
        }


        if (isTeach) {

            teachStream = media;

            teachFrames = [];

            teachTimer =
                requestAnimationFrame(
                    teachLoop
                );

        } else {

            stream = media;

            signFrames = [];

            last.label = "";
            last.confidence = 0;

            signTimer =
                requestAnimationFrame(
                    signLoop
                );

        }


        toast(
            isTeach
                ? "Calibration camera started."
                : "Sign camera started."
        );

    }

    catch (error) {

        console.error(
            "CAMERA ERROR:",
            error
        );

        toast(
            "Camera permission is required."
        );

    }

}


/* =========================================================
   STOP SIGN CAMERA
========================================================= */

function stopSignCamera() {

    if (signTimer) {

        cancelAnimationFrame(
            signTimer
        );

        signTimer = null;

    }


    if (stream) {

        stream.getTracks().forEach(
            track => track.stop()
        );

        stream = null;

    }


    if ($("video")) {
        $("video").srcObject = null;
    }


    if ($("placeholder")) {
        $("placeholder").style.display = "flex";
    }


    signFrames = [];

    clearLandmarkState();

}


/* =========================================================
   STOP TEACH CAMERA
========================================================= */

function stopTeachCamera() {

    if (teachTimer) {

        cancelAnimationFrame(
            teachTimer
        );

        teachTimer = null;

    }


    if (teachStream) {

        teachStream.getTracks().forEach(
            track => track.stop()
        );

        teachStream = null;

    }


    if ($("tvideo")) {
        $("tvideo").srcObject = null;
    }


    if ($("tplaceholder")) {
        $("tplaceholder").style.display = "flex";
    }


    teachFrames = [];

}


/* =========================================================
   STOP EVERYTHING
========================================================= */

function stopAll() {

    stopSignCamera();
    stopTeachCamera();

}


/* =========================================================
   IMAGE
========================================================= */

function frameImage(video) {

    const canvas =
        document.createElement("canvas");

    canvas.width =
        video.videoWidth || 640;

    canvas.height =
        video.videoHeight || 480;

    const ctx =
        canvas.getContext("2d");

    ctx.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
    );

    return canvas.toDataURL(
        "image/jpeg",
        0.72
    );

}


/* =========================================================
   LANDMARK HELPERS
========================================================= */

function parseLandmarks(points) {

    if (!points || points.length < 63) {
        return [];
    }

    const result = [];

    for (
        let i = 0;
        i < 63;
        i += 3
    ) {

        result.push({
            x: Number(points[i]) || 0,
            y: Number(points[i + 1]) || 0,
            z: Number(points[i + 2]) || 0
        });

    }

    return result;

}


/* =========================================================
   SMOOTH LANDMARK MOVEMENT
========================================================= */

function smoothPoints(oldPoints, newPoints) {

    if (!newPoints.length) {
        return [];
    }

    if (
        !oldPoints ||
        oldPoints.length !== newPoints.length
    ) {

        return newPoints.map(p => ({
            ...p
        }));

    }

    const alpha = 0.42;

    return newPoints.map((p, i) => {

        const old = oldPoints[i];

        return {

            x:
                old.x +
                (p.x - old.x) * alpha,

            y:
                old.y +
                (p.y - old.y) * alpha,

            z:
                old.z +
                (p.z - old.z) * alpha

        };

    });

}


/* =========================================================
   LANDMARK TRAIL
========================================================= */

function updateTrail(hand, points) {

    if (!points.length) {
        landmarkTrails[hand] = [];
        return;
    }

    const center = points[9];

    if (!center) return;

    if (!landmarkTrails[hand]) {
        landmarkTrails[hand] = [];
    }

    landmarkTrails[hand].push({
        x: center.x,
        y: center.y,
        time: performance.now()
    });

    if (landmarkTrails[hand].length > 14) {
        landmarkTrails[hand].shift();
    }

}


/* =========================================================
   PREMIUM HAND DRAW
========================================================= */

function drawPremiumHand(
    ctx,
    canvas,
    points,
    hand,
    time
) {

    if (!points || points.length !== LANDMARK_COUNT) {
        return;
    }

    const light =
        document.body.classList.contains("light");


    const xy =
        points.map(point => ({

            x: point.x * canvas.width,

            y: point.y * canvas.height

        }));


    /*
       ---------------------------------------------
       MOTION TRAIL
       ---------------------------------------------
    */

    const trail =
        landmarkTrails[hand] || [];

    trail.forEach((p, index) => {

        const alpha =
            (index + 1) /
            trail.length *
            0.18;

        ctx.beginPath();

        ctx.arc(
            p.x * canvas.width,
            p.y * canvas.height,
            3 + index * 0.25,
            0,
            Math.PI * 2
        );

        ctx.fillStyle =
            light
                ? `rgba(8,124,255,${alpha})`
                : `rgba(0,234,255,${alpha})`;

        ctx.fill();

    });


    /*
       ---------------------------------------------
       THIN NEON SKELETON
       ---------------------------------------------
    */

    ctx.save();

    ctx.lineWidth = 1.35;

    ctx.lineCap = "round";

    ctx.lineJoin = "round";

    ctx.strokeStyle =
        light
            ? "rgba(8,124,255,.78)"
            : "rgba(0,234,255,.82)";

    ctx.shadowColor =
        light
            ? "rgba(8,124,255,.55)"
            : "rgba(0,234,255,.9)";

    ctx.shadowBlur = 7;


    HAND_CONNECTIONS.forEach(
        ([a, b]) => {

            if (!xy[a] || !xy[b]) {
                return;
            }

            ctx.beginPath();

            ctx.moveTo(
                xy[a].x,
                xy[a].y
            );

            ctx.lineTo(
                xy[b].x,
                xy[b].y
            );

            ctx.stroke();

        }
    );

    ctx.restore();


    /*
       ---------------------------------------------
       GLOWING JOINTS
       ---------------------------------------------
    */

    xy.forEach(
        (p, index) => {

            const pulse =
                1 +
                Math.sin(
                    time * 0.005 +
                    index * 0.42
                ) * 0.25;

            const radius =
                (index === 0 ? 3.2 : 2.25) *
                pulse;


            /*
               outer glow
            */

            ctx.beginPath();

            ctx.arc(
                p.x,
                p.y,
                radius * 2.8,
                0,
                Math.PI * 2
            );

            ctx.fillStyle =
                light
                    ? "rgba(8,124,255,.10)"
                    : "rgba(0,234,255,.13)";

            ctx.fill();


            /*
               main point
            */

            ctx.beginPath();

            ctx.arc(
                p.x,
                p.y,
                radius,
                0,
                Math.PI * 2
            );

            ctx.fillStyle =
                light
                    ? "#087cff"
                    : "#00eaff";

            ctx.shadowColor =
                light
                    ? "#087cff"
                    : "#00eaff";

            ctx.shadowBlur = 10;

            ctx.fill();


            /*
               tiny white core
            */

            ctx.beginPath();

            ctx.arc(
                p.x,
                p.y,
                Math.max(
                    0.7,
                    radius * 0.34
                ),
                0,
                Math.PI * 2
            );

            ctx.fillStyle =
                "#ffffff";

            ctx.shadowBlur = 0;

            ctx.fill();

        }
    );


    /*
       ---------------------------------------------
       WRIST RING
       ---------------------------------------------
    */

    const wrist = xy[0];

    if (wrist) {

        const ring =
            8 +
            Math.sin(time * 0.004) * 2;

        ctx.beginPath();

        ctx.arc(
            wrist.x,
            wrist.y,
            ring,
            0,
            Math.PI * 2
        );

        ctx.strokeStyle =
            light
                ? "rgba(107,76,255,.38)"
                : "rgba(139,92,255,.55)";

        ctx.lineWidth = 1;

        ctx.shadowColor =
            light
                ? "#6b4cff"
                : "#8b5cff";

        ctx.shadowBlur = 8;

        ctx.stroke();

    }

}


/* =========================================================
   DRAW ALL LANDMARKS
========================================================= */

function drawLandmarks(
    canvas,
    left,
    right
) {

    if (!canvas) return;

    const ctx =
        canvas.getContext("2d");

    const time =
        performance.now();

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


    /*
       Resize canvas to camera
    */

    const video =
        canvas.previousElementSibling;

    if (
        video &&
        video.videoWidth &&
        video.videoHeight
    ) {

        if (
            canvas.width !== video.videoWidth ||
            canvas.height !== video.videoHeight
        ) {

            canvas.width =
                video.videoWidth;

            canvas.height =
                video.videoHeight;

        }

    }


    const rawLeft =
        parseLandmarks(left);

    const rawRight =
        parseLandmarks(right);


    /*
       Smooth
    */

    animatedLandmarks.left =
        smoothPoints(
            animatedLandmarks.left,
            rawLeft
        );

    animatedLandmarks.right =
        smoothPoints(
            animatedLandmarks.right,
            rawRight
        );


    /*
       Trails
    */

    updateTrail(
        "left",
        animatedLandmarks.left
    );

    updateTrail(
        "right",
        animatedLandmarks.right
    );


    /*
       Draw
    */

    drawPremiumHand(
        ctx,
        canvas,
        animatedLandmarks.left,
        "left",
        time
    );

    drawPremiumHand(
        ctx,
        canvas,
        animatedLandmarks.right,
        "right",
        time
    );


    /*
       Keep animation alive
    */

    requestAnimationFrame(() => {

        if (
            stream ||
            teachStream
        ) {

            drawLandmarks(
                canvas,
                lastLandmarks.left,
                lastLandmarks.right
            );

        }

    });

}


/* =========================================================
   CLEAR LANDMARK STATE
========================================================= */

function clearLandmarkState() {

    lastLandmarks = {
        left: [],
        right: []
    };

    animatedLandmarks = {
        left: [],
        right: []
    };

    previousLandmarks = {
        left: [],
        right: []
    };

    landmarkTrails = {
        left: [],
        right: []
    };

}


/* =========================================================
   EXTRACT FEATURES
========================================================= */

async function extractFrame(
    video,
    canvas
) {

    const image =
        frameImage(video);

    const response =
        await fetch(
            API + "/extract_features",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    image_base64: image
                })
            }
        );


    if (!response.ok) {

        throw new Error(
            "Feature extraction failed"
        );

    }


    const data =
        await response.json();


    lastLandmarks.left =
        data.leftLandmarks || [];

    lastLandmarks.right =
        data.rightLandmarks || [];


    drawLandmarks(
        canvas,
        lastLandmarks.left,
        lastLandmarks.right
    );


    return data;

}


/* =========================================================
   SIGN LOOP
========================================================= */

async function signLoop() {

    if (!stream) return;

    try {

        const video =
            $("video");

        const canvas =
            $("canvas");


        if (
            video.readyState <
            HTMLMediaElement.HAVE_CURRENT_DATA
        ) {

            signTimer =
                requestAnimationFrame(
                    signLoop
                );

            return;

        }


        const data =
            await extractFrame(
                video,
                canvas
            );


        const hands =
            data.handsDetected || 0;


        /*
           STATUS
        */

        if ($("hands")) {

            $("hands").textContent =
                hands === 0
                    ? "NO HAND"
                    : hands +
                      " HAND" +
                      (hands > 1 ? "S" : "") +
                      " DETECTED";

        }


        if ($("landmarks")) {

            $("landmarks").textContent =
                data.featureSize +
                " / 168";

        }


        /*
           VALID FRAME ONLY
        */

        if (hands > 0) {

            signFrames.push(
                data.features
            );

        }


        if (
            signFrames.length > N
        ) {

            signFrames =
                signFrames.slice(-N);

        }


        if ($("buffer")) {

            $("buffer").textContent =
                signFrames.length +
                " / " +
                N;

        }


        /*
           PREDICTION
        */

        if (
            signFrames.length === N
        ) {

            await predictCustom();

            signFrames =
                signFrames.slice(
                    Math.floor(N / 2)
                );

        }

    }

    catch (error) {

        console.error(
            "SIGN LOOP:",
            error
        );

    }


    signTimer =
        requestAnimationFrame(
            signLoop
        );

}


/* =========================================================
   CUSTOM MODEL
========================================================= */

async function predictCustom() {

    const response =
        await fetch(
            API + "/predict_custom",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    sequence:
                        signFrames
                })
            }
        );


    if (!response.ok) {
        return;
    }


    const data =
        await response.json();


    const confidence =
        Number(
            data.confidence || 0
        );


    last.label =
        data.label || "UNKNOWN";

    last.confidence =
        confidence;


    if ($("pred")) {

        $("pred").textContent =
            data.label || "UNKNOWN";

    }


    if ($("conf")) {

        $("conf").textContent =
            Math.round(
                confidence * 100
            ) + "%";

    }


    if ($("fill")) {

        $("fill").style.width =
            Math.min(
                100,
                confidence * 100
            ) + "%";

    }


    if ($("modelstate")) {

        $("modelstate").textContent =
            data.accepted
                ? "CUSTOM MODEL ✓"
                : "CUSTOM MODEL";

    }


    if ($("use")) {

        $("use").disabled =
            !data.accepted;

    }


    if (data.accepted && $("pred")) {

        $("pred").style.animation =
            "none";

        void $("pred").offsetWidth;

        $("pred").style.animation =
            "pageIn .35s ease";

    }

}


/* =========================================================
   SIGN CAMERA BUTTONS
========================================================= */

if ($("start")) {

    $("start").onclick = () => {

        signFrames = [];

        clearLandmarkState();

        camera("sign");

    };

}


if ($("stop")) {

    $("stop").onclick = () => {

        stopSignCamera();

        toast(
            "Sign camera stopped."
        );

    };

}


/* =========================================================
   USE SIGN INPUT
========================================================= */

if ($("use")) {

    $("use").onclick = () => {

        if (
            !last.label ||
            last.label === "UNKNOWN" ||
            last.confidence < 0.5
        ) {

            toast(
                "Please make a clearer sign first."
            );

            return;

        }


        /*
           SIGN FLOW:

           SIGN
             ↓
           BACKEND
             ↓
           ORCHESTRATOR
             ↓
           RAG / LLM
             ↓
           RESULT

           NEVER → VOICE
        */

        processRequest(
            "sign",
            last.label,
            last.confidence
        );

    };

}


/* =========================================================
   TEACH MY SIGNS
========================================================= */

if ($("tstart")) {

    $("tstart").onclick = () => {

        teachFrames = [];

        camera("teach");

    };

}


/*
   Keep existing sample button behaviour
*/

if ($("tsample")) {

    $("tsample").onclick = () => {

        stopTeachCamera();

        toast(
            "Calibration camera stopped."
        );

    };

}


/* =========================================================
   TEACH LOOP
========================================================= */

async function teachLoop() {

    if (!teachStream) {
        return;
    }


    try {

        const video =
            $("tvideo");

        const canvas =
            $("tcanvas");


        if (
            video.readyState <
            HTMLMediaElement.HAVE_CURRENT_DATA
        ) {

            teachTimer =
                requestAnimationFrame(
                    teachLoop
                );

            return;

        }


        const data =
            await extractFrame(
                video,
                canvas
            );


        if (
            data.handsDetected > 0
        ) {

            teachFrames.push(
                data.features
            );

        }


        if (
            teachFrames.length > N
        ) {

            teachFrames =
                teachFrames.slice(-N);

        }


        if ($("sample")) {

            $("sample").textContent =
                teachFrames.length +
                " / " +
                N;

        }


        if ($("samplefill")) {

            $("samplefill").style.width =
                Math.min(
                    100,
                    teachFrames.length /
                    N *
                    100
                ) + "%";

        }

    }

    catch (error) {

        console.error(
            "TEACH LOOP:",
            error
        );

    }


    teachTimer =
        requestAnimationFrame(
            teachLoop
        );

}


/* =========================================================
   CAPTURE CALIBRATION SAMPLE
========================================================= */

if ($("capture")) {

    $("capture").onclick =
        async () => {

            const label =
                $("label").value.trim();


            if (!label) {

                toast(
                    "Enter a sign label first."
                );

                return;

            }


            if (
                teachFrames.length < N
            ) {

                toast(
                    "Capture 32 valid hand frames first."
                );

                return;

            }


            try {

                $("tstatus").textContent =
                    "Saving sample...";


                const response =
                    await fetch(
                        API +
                        "/calibration/save",
                        {

                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({

                                    label,

                                    sequence:
                                        teachFrames.slice(-N)

                                })

                        }
                    );


                const data =
                    await response.json();


                if (!response.ok) {

                    throw new Error(
                        data.detail ||
                        "Could not save sample"
                    );

                }


                $("tstatus").textContent =
                    `Saved ${data.label} sample #${data.sampleCount}.`;


                teachFrames = [];


                await loadCalibrationStatus();


                toast(
                    "Calibration sample saved ✓"
                );

            }

            catch (error) {

                console.error(error);

                $("tstatus").textContent =
                    error.message;

                toast(
                    error.message
                );

            }

        };

}


/* =========================================================
   CALIBRATION STATUS
========================================================= */

async function loadCalibrationStatus() {

    try {

        const response =
            await fetch(
                API +
                "/calibration/status"
            );


        if (!response.ok) {
            return;
        }


        const data =
            await response.json();


        calibration.labels =
            data.labels || {};


        calibration.totalSamples =
            data.totalSamples || 0;


        if ($("total")) {

            $("total").textContent =
                calibration.totalSamples;

        }


        if ($("saved")) {

            $("saved").textContent =
                Object.keys(
                    calibration.labels
                ).length;

        }


        const labels =
            calibration.labels;


        const enoughLabels =
            Object.keys(labels).length >= 2;


        const enoughSamples =
            Object.values(labels)
                .every(
                    count => count >= 2
                );


        if ($("train")) {

            $("train").disabled =
                !(
                    enoughLabels &&
                    enoughSamples
                );

        }

    }

    catch (error) {

        console.error(
            "CAL STATUS:",
            error
        );

    }

}


/* =========================================================
   TRAIN MODEL
========================================================= */

if ($("train")) {

    $("train").onclick =
        async () => {

            try {

                $("tstatus").textContent =
                    "Training custom model...";


                const response =
                    await fetch(
                        API +
                        "/calibration/train",
                        {
                            method: "POST"
                        }
                    );


                const data =
                    await response.json();


                if (!response.ok) {

                    throw new Error(
                        data.detail ||
                        "Training failed"
                    );

                }


                $("tstatus").textContent =
                    "Custom model trained successfully ✓";


                toast(
                    "CUSTOM MODEL READY ✓"
                );


                await loadModelInfo();

            }

            catch (error) {

                console.error(error);

                $("tstatus").textContent =
                    error.message;

                toast(
                    error.message
                );

            }

        };

}


/* =========================================================
   RESET CALIBRATION
========================================================= */

if ($("reset")) {

    $("reset").onclick =
        async () => {

            try {

                const response =
                    await fetch(
                        API +
                        "/calibration/reset",
                        {
                            method: "POST"
                        }
                    );


                if (response.ok) {

                    calibration = {
                        labels: {},
                        totalSamples: 0
                    };


                    await loadCalibrationStatus();


                    toast(
                        "Calibration reset."
                    );

                }

            }

            catch (error) {

                console.error(error);

            }

        };

}


/* =========================================================
   MODEL INFO
========================================================= */

async function loadModelInfo() {

    try {

        const response =
            await fetch(
                API +
                "/model-info"
            );


        if (!response.ok) {
            return;
        }


        const data =
            await response.json();


        if (
            data.custom &&
            data.custom.loaded &&
            $("modelstate")
        ) {

            $("modelstate").textContent =
                "CUSTOM MODEL ✓";

        }

    }

    catch (error) {

        console.error(
            "MODEL INFO:",
            error
        );

    }

}


/* =========================================================
   VOICE
========================================================= */

const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;


if (SpeechRecognition) {

    recognition =
        new SpeechRecognition();


    recognition.lang =
        "en-IN";


    recognition.continuous =
        false;


    recognition.interimResults =
        false;


    recognition.onstart = () => {

        if ($("vstatus")) {

            $("vstatus").textContent =
                "Listening...";

        }


        if ($("listen")) {

            $("listen").textContent =
                "LISTENING...";

        }

    };


    recognition.onresult =
        event => {

            voiceText =
                event.results[0][0]
                    .transcript;


            if ($("transcript")) {

                $("transcript").textContent =
                    voiceText;

            }


            if ($("vstatus")) {

                $("vstatus").textContent =
                    "Request recognized ✓";

            }

        };


    recognition.onerror =
        event => {

            console.error(event);

            if ($("vstatus")) {

                $("vstatus").textContent =
                    "Could not recognize speech.";

            }

        };


    recognition.onend =
        () => {

            if ($("listen")) {

                $("listen").textContent =
                    "START LISTENING";

            }

        };

}


if ($("listen")) {

    $("listen").onclick = () => {

        if (!recognition) {

            toast(
                "Speech recognition is not supported in this browser."
            );

            return;

        }


        try {

            recognition.start();

        }

        catch (error) {

            console.warn(
                "Recognition already active."
            );

        }

    };

}


if ($("vuse")) {

    $("vuse").onclick = () => {

        if (!voiceText.trim()) {

            toast(
                "Please speak your request first."
            );

            return;

        }


        processRequest(
            "voice",
            voiceText,
            null
        );

    };

}


/* =========================================================
   TEXT
========================================================= */

if ($("textuse")) {

    $("textuse").onclick = () => {

        const text =
            $("textinput").value.trim();


        if (!text) {

            toast(
                "Please enter your request."
            );

            return;

        }


        processRequest(
            "text",
            text,
            null
        );

    };

}


/* =========================================================
   DOCUMENT
========================================================= */

if ($("file")) {

    $("file").onchange = () => {

        const file =
            $("file").files[0];


        if (!file) {

            $("fileinfo").textContent =
                "No document selected.";

            return;

        }


        $("fileinfo").textContent =
            `${file.name} • ${Math.round(
                file.size / 1024
            )} KB`;

    };

}


if ($("docuse")) {

    $("docuse").onclick = () => {

        const file =
            $("file").files[0];


        if (!file) {

            toast(
                "Select a document first."
            );

            return;

        }


        processRequest(
            "document",
            "Document assistance: " +
            file.name,
            null
        );

    };

}


/* =========================================================
   PROCESS REQUEST
========================================================= */

async function processRequest(
    inputType,
    input,
    confidence
) {

    if (
        !input ||
        !input.trim()
    ) {

        toast(
            "Input is empty."
        );

        return;

    }


    go("processing");


    if (inputType === "sign") {

        $("processing-title").textContent =
            "Understanding your sign.";

        $("processing-sub").textContent =
            "Your recognized sign is being routed to the appropriate assistance layer.";

    }

    else if (inputType === "voice") {

        $("processing-title").textContent =
            "Understanding your request.";

        $("processing-sub").textContent =
            "Your voice request is being processed.";

    }

    else if (inputType === "text") {

        $("processing-title").textContent =
            "Understanding your request.";

        $("processing-sub").textContent =
            "Your text is being routed to the appropriate assistance layer.";

    }

    else if (inputType === "document") {

        $("processing-title").textContent =
            "Understanding your document.";

        $("processing-sub").textContent =
            "Finding the relevant assistance and guidance.";

    }


    await new Promise(
        resolve =>
            setTimeout(
                resolve,
                700
            )
    );


    try {

        const response =
            await fetch(
                API +
                "/api/v1/process",
                {

                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({

                            input_type:
                                inputType,

                            input:
                                input,

                            confidence:
                                confidence

                        })

                }
            );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.detail ||
                "Request failed."
            );

        }


        renderResult(data);

        go("result");

    }

    catch (error) {

        console.error(
            "PROCESS ERROR:",
            error
        );


        $("rtitle").textContent =
            "Unable to process request";


        $("rsub").textContent =
            "Please try again.";


        $("answer").textContent =
            error.message;


        $("sources").innerHTML =
            "";


        go("result");

    }

}


/* =========================================================
   RESULT
========================================================= */

function renderResult(data) {

    const response =
        data.response || {};


    $("rtitle").textContent =
        response.title ||
        "Assistance Found";


    $("rsub").textContent =
        data.recognized_text
            ? `Based on: ${data.recognized_text}`
            : "Based on your request";


    $("answer").textContent =
        response.answer ||
        "No answer was returned.";


    const sources =
        data.sources ||
        response.sources ||
        [];


    if (!sources.length) {

        $("sources").innerHTML =
            `
            <div class="source-item">
                <strong>
                    No verified sources returned.
                </strong>
                Please try a more specific request.
            </div>
            `;

    }

    else {

        $("sources").innerHTML =
            sources.map(
                source => {

                    const title =
                        escapeHtml(
                            source.title ||
                            "Official Source"
                        );


                    const url =
                        source.url || "";


                    return `
                        <div class="source-item">

                            <strong>
                                ${title}
                            </strong>

                            ${
                                url
                                    ? `
                                    <a
                                        href="${escapeAttribute(url)}"
                                        target="_blank"
                                        rel="noopener"
                                    >
                                        ${escapeHtml(url)}
                                    </a>
                                    `
                                    :
                                    `
                                    <span>
                                        Official source
                                    </span>
                                    `
                            }

                        </div>
                    `;

                }
            ).join("");

    }


    console.log(
        "MODULE USED:",
        data.module_used
    );

    console.log(
        "INTENT:",
        data.intent
    );

    console.log(
        "GROUNDED:",
        data.grounded
    );

}


/* =========================================================
   READ ALOUD
========================================================= */

if ($("speak")) {

    $("speak").onclick = () => {

        const text =
            $("answer").textContent;


        if (!text.trim()) {

            toast(
                "Nothing to read."
            );

            return;

        }


        if (
            !("speechSynthesis" in window)
        ) {

            toast(
                "Read aloud is not supported."
            );

            return;

        }


        speechSynthesis.cancel();


        const utterance =
            new SpeechSynthesisUtterance(
                text
            );


        utterance.lang =
            "en-IN";


        utterance.rate =
            0.92;


        speechSynthesis.speak(
            utterance
        );

    };

}


/* =========================================================
   ACCESSIBILITY HUD
   ---------------------------------------------------------
   Adds premium accessibility indicators dynamically.
========================================================= */

function ensureAccessibilityHUD(page) {

    const section =
        $(page);

    if (!section) return;


    let hud =
        section.querySelector(
            ".dynamic-accessibility-hud"
        );


    if (hud) return;


    hud =
        document.createElement("div");

    hud.className =
        "dynamic-accessibility-hud";


    hud.innerHTML = `
        <div class="access-hud-item">
            <span class="access-dot"></span>
            <span>ACCESSIBILITY ACTIVE</span>
        </div>

        <div class="access-hud-item">
            <span class="access-icon">♿</span>
            <span>INCLUSIVE AI</span>
        </div>

        <div class="access-hud-item">
            <span class="access-icon">✋</span>
            <span>HAND VISION</span>
        </div>
    `;


    section.appendChild(hud);

}


/* =========================================================
   SAFE HTML
========================================================= */

function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


function escapeAttribute(value) {

    return escapeHtml(value);

}


/* =========================================================
   INITIALIZATION
========================================================= */

async function init() {

    /*
       ALWAYS START ON WELCOME
    */

    go("welcome");


    /*
       Accessibility visual
    */

    ensureAccessibilityHUD("welcome");


    /*
       Backend health
    */

    try {

        const response =
            await fetch(
                API +
                "/health"
            );


        if (!response.ok) {

            throw new Error(
                "Backend unavailable"
            );

        }


        const data =
            await response.json();


        console.log(
            "SANKET SETU BACKEND:",
            data
        );


        if (
            data.status === "ok"
        ) {

            console.log(
                "✓ Backend online"
            );

        }

    }

    catch (error) {

        console.warn(
            "Backend not reachable:",
            error
        );

    }


    await loadCalibrationStatus();

    await loadModelInfo();

}


/* =========================================================
   START APPLICATION
========================================================= */

init();