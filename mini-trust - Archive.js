

(function () {
  const canvas = document.getElementById("mini-trust-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const width = 220;
  const height = 155;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  let seed = 71;

  function random() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const colors = [
    "#2c7a2c",
    "#6b9b72",
    "#a9c5ad"
  ];

  const pairs = [];
  const nPairs = 24;
  const centerY = 77;

  // Generate within-pair differences.
  // X differences are positive by convention,
  // while Y differences can be positive or negative.

  const rawDx = [];
  const rawDy = [];

  for (let i = 0; i < nPairs; i++) {
    rawDx.push(9 + random() * 18);
    rawDy.push((random() - 0.5) * 24);
  }

  // Orthogonalize Y differences against X differences.
  // This ensures the within-pair regression slope is zero,
  // while individual pairs retain different slopes.

  const dotXY = rawDx.reduce(
    (sum, dx, i) => sum + dx * rawDy[i],
    0
  );

  const dotXX = rawDx.reduce(
    (sum, dx) => sum + dx * dx,
    0
  );

  const projection = dotXY / dotXX;

  for (let i = 0; i < nPairs; i++) {
    const familyX = 28 + random() * 164;

    // Positive pooled association:
    // families with higher X also have higher Y.
    // Canvas Y coordinates run downward.
    const familyY =
      128 - familyX * 0.46
      + (random() - 0.5) * 16;

    const dx = rawDx[i];
    const dy = rawDy[i] - projection * dx;

    pairs.push({
      color: colors[i % colors.length],
      phase: random() * Math.PI * 2,
      twins: [
        {
          x: familyX - dx / 2,
          y: familyY - dy / 2
        },
        {
          x: familyX + dx / 2,
          y: familyY + dy / 2
        }
      ]
    });
  }

  // Calculate pooled OLS regression.
  const rawPoints = pairs.flatMap(pair => pair.twins);

  const meanX =
    rawPoints.reduce((sum, p) => sum + p.x, 0)
    / rawPoints.length;

  const meanY =
    rawPoints.reduce((sum, p) => sum + p.y, 0)
    / rawPoints.length;

  const pooledNumerator = rawPoints.reduce(
    (sum, p) =>
      sum + (p.x - meanX) * (p.y - meanY),
    0
  );

  const pooledDenominator = rawPoints.reduce(
    (sum, p) =>
      sum + (p.x - meanX) ** 2,
    0
  );

  const pooledSlope =
    pooledNumerator / pooledDenominator;

  // Within-pair regression coefficient.
  const withinNumerator = pairs.reduce(
    (sum, pair) => {
      const [a, b] = pair.twins;
      return sum + (b.x - a.x) * (b.y - a.y);
    },
    0
  );

  const withinDenominator = pairs.reduce(
    (sum, pair) => {
      const [a, b] = pair.twins;
      return sum + (b.x - a.x) ** 2;
    },
    0
  );

  const withinSlope =
    withinNumerator / withinDenominator;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  function smooth(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }

  function draw(time) {
    ctx.clearRect(0, 0, width, height);

    // Unlabeled axes.
    ctx.beginPath();
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.65;
    ctx.setLineDash([]);

    ctx.moveTo(0.5, 0);
    ctx.lineTo(0.5, height - 0.5);
    ctx.lineTo(width, height - 0.5);
    ctx.stroke();

    ctx.globalAlpha = 1;

    // Animation:
    // 0–28%: pooled data
    // 28–52%: remove pair-specific Y intercepts
    // 52–78%: vertically adjusted data
    // 78–100%: return to pooled data

    const phase = (time % 10000) / 10000;

    let mix;

    if (phase < 0.28) {
      mix = 0;
    } else if (phase < 0.52) {
      mix = (phase - 0.28) / 0.24;
    } else if (phase < 0.78) {
      mix = 1;
    } else {
      mix = 1 - (phase - 0.78) / 0.22;
    }

    mix = smooth(mix);

    // Vertical-only transformation.
    //
    // Each twin retains its original X coordinate.
    // Subtract the pair's mean Y and recenter
    // around a common horizontal baseline.
    //
    // Within-pair Y differences are preserved.

    const transformed = pairs.map(pair => {
      const [a, b] = pair.twins;

      const pairMeanY = (a.y + b.y) / 2;

      return pair.twins.map(twin => ({
        x: twin.x,
        y:
          twin.y * (1 - mix) +
          (centerY + twin.y - pairMeanY) * mix
      }));
    });

    // Reference line in the adjusted state.
    if (mix > 0.01) {
      ctx.globalAlpha = 0.2 * mix;
      ctx.strokeStyle = "#9ca3af";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);

      ctx.beginPath();
      ctx.moveTo(10, centerY);
      ctx.lineTo(215, centerY);
      ctx.stroke();

      ctx.setLineDash([]);
    }

    // Draw connected twin pairs.
    transformed.forEach((twins, i) => {
      const pair = pairs[i];

      ctx.beginPath();
      ctx.moveTo(twins[0].x, twins[0].y);
      ctx.lineTo(twins[1].x, twins[1].y);

      ctx.strokeStyle = pair.color;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.35;
      ctx.stroke();

      twins.forEach((twin, j) => {
        const drift = reducedMotion
          ? 0
          : Math.sin(
              time * 0.0007 + pair.phase + j
            ) * 0.45 * (1 - mix);

        ctx.beginPath();
        ctx.arc(
          twin.x,
          twin.y + drift,
          2.2,
          0,
          Math.PI * 2
        );

        ctx.fillStyle = pair.color;
        ctx.globalAlpha = 0.84;
        ctx.fill();
      });
    });

    // Pooled OLS regression line.
    // Positive naive association.
    ctx.strokeStyle = "#2c7a2c";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.globalAlpha = 0.65 * (1 - mix);

    ctx.beginPath();
    ctx.moveTo(
      10,
      meanY + pooledSlope * (10 - meanX)
    );
    ctx.lineTo(
      210,
      meanY + pooledSlope * (210 - meanX)
    );
    ctx.stroke();

    // Within-pair fixed-effects regression.
    // Horizontal because the within-pair
    // coefficient is approximately zero.
    ctx.globalAlpha = 0.75 * mix;

    ctx.beginPath();
    ctx.moveTo(
      10,
      centerY + withinSlope * (10 - meanX)
    );
    ctx.lineTo(
      210,
      centerY + withinSlope * (210 - meanX)
    );
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  if (reducedMotion) {
    draw(5500);
  } else {
    const start = performance.now();

    function animate(now) {
      draw(now - start);
      requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
  }
})();