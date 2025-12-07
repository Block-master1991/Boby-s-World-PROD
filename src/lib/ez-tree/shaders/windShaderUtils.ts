import * as THREE from 'three';
import { GrassOptions } from '../environment/grass'; // Keep for reference if needed, but will use WindOptions

// Define a common interface for wind-related options
export interface WindOptions {
  windStrength: { x: number; y: number; z: number };
  windFrequency: number;
  windScale: number;
  patchiness?: number; // Optional, as not all objects might use it for wind
  scale?: number; // Optional, as not all objects might use it for wind
}

export function appendWindShader(material: THREE.Material | THREE.Material[], options: WindOptions, instanced: boolean = false): void {
  if (!material) return;

  const materials = Array.isArray(material) ? material : [material];

  materials.forEach((mat) => {
    if (!mat) return;

    // Check if the material already has the wind shader
    if (mat.userData && mat.userData.shader && mat.userData.shader.uniforms && mat.userData.shader.uniforms.uWindStrength) {
      // If it does, just update the values
      mat.userData.shader.uniforms.uWindStrength.value = new THREE.Vector3(
        options.windStrength.x,
        options.windStrength.y,
        options.windStrength.z
      );
      mat.userData.shader.uniforms.uWindFrequency.value = options.windFrequency;
      mat.userData.shader.uniforms.uWindScale.value = options.windScale || 70.0;
      return;
    }

    mat.onBeforeCompile = (shader: { uniforms: Record<string, { value: number | THREE.Vector3 | boolean }>; vertexShader: string }) => {
      if (!shader) return;

      shader.uniforms = shader.uniforms || {};
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uWindStrength = { value: new THREE.Vector3(
        options.windStrength.x,
        options.windStrength.y,
        options.windStrength.z
      ) };
      shader.uniforms.uWindFrequency = { value: 0.5 }; // Using frequency from tree.js and grass.js
      shader.uniforms.uWindScale = { value: 70.0 }; // Using scale from tree.js

      shader.vertexShader = `
      uniform float uTime;
      uniform vec3 uWindStrength;
      uniform float uWindFrequency;
      uniform float uWindScale;
      ` + shader.vertexShader;

      // Store a reference to the shader on the material for later updates
      mat.userData.shader = shader;
      mat.userData.lastWindUpdate = 0;

      shader.vertexShader = shader.vertexShader.replace(
        `void main() {`,
        `
        vec3 mod289(vec3 x) {
          return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec2 mod289(vec2 x) {
          return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec3 permute(vec3 x) {
          return mod289(((x * 34.0) + 1.0) * x);
        }

        float simplex2d(vec2 v) {
          const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
          vec2 i = floor(v + dot(v, C.yy));
          vec2 x0 = v - i + dot(i, C.xx);
          vec2 i1;
          i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;

          i = mod289(i);
          vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));

          vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
          m = m * m;
          m = m * m;

          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;

          m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

          vec3 g;
          g.x = a0.x * x0.x + h.x * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        // GLSL Simplex Noise 3D
        // Source: https://github.com/ashima/webgl-noise

        vec3 mod289_3d(vec3 x) {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec4 mod289_4d(vec4 x) {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec4 permute_4d(vec4 x) {
            return mod289_4d(((x*34.0)+1.0)*x);
        }

        vec4 taylorInvSqrt(vec4 r) {
            return 1.79284291400159 - 0.85373472095314 * r;
        }

        vec3 fade(vec3 t) {
            return t*t*t*(t*(t*6.0-15.0)+10.0);
        }

        // Classic Simplex Noise 3D
        float simplex3d(vec3 v) {
            const vec2  C = vec2(1.0/6.0, 1.0/3.0);
            const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

            // First corner
            vec3 i  = floor(v + dot(v, C.yyy) );
            vec3 x0 = v - i + dot(i, C.xxx);

            // Other corners
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min( g.xyz, l.zxy );
            vec3 i2 = max( g.xyz, l.zxy );

            //  x0 = x0 - 0. + 0.0 * C
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy; // 2.0 * C.x = 1/3 = C.y
            vec3 x3 = x0 - D.yyy;      // -1.0 + 3.0 * C.x = -0.5

            // Permutations
            i = mod289_3d(i);
            vec4 p = permute_4d( permute_4d( permute_4d(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                      + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                      + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

            // Gradients: 7x7 points over a square, mapped onto an octahedron.
            // The ring size 17*17 = 289 is close to the mapping's singularity.
            float n_ = 0.142857142857; // 1.0/7.0
            vec3  ns = n_ * D.wyz - D.xzx;

            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);

            vec4 b0 = vec4( x.xy, y.xy );
            vec4 b1 = vec4( x.zw, y.zw );

            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));

            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

            vec3 g0 = vec3(a0.xy,h.x);
            vec3 g1 = vec3(a0.zw,h.y);
            vec3 g2 = vec3(a1.xy,h.z);
            vec3 g3 = vec3(a1.zw,h.w);

            // Normalise gradients
            vec4 norm = taylorInvSqrt(vec4(dot(g0,g0), dot(g1,g1), dot(g2,g2), dot(g3,g3)));
            g0 *= norm.x;
            g1 *= norm.y;
            g2 *= norm.z;
            g3 *= norm.w;

            // Mix contributions from the four corners
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot( m*m, vec4( dot(g0,x0), dot(g1,x1),
                                          dot(g2,x2), dot(g3,x3) ) );
        }

        void main() {`,
      );

      const vertexShaderCode = instanced ?
        `
        vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
        vec2 worldPositionXZ = (modelMatrix * mvPosition).xz;
        float windOffset = 2.0 * 3.14 * simplex2d(worldPositionXZ / uWindScale);

        // تحسين حركة العشب في النسخة المثبتة
        float heightFactor = pow(position.y, 0.6);
        float bendReduction = 1.0 - abs(normal.y) * 0.2;

        // استخدام دوال أكثر انسيابية لضمان عدم وجود توقف في الحركة
        float smoothTime = uTime * 1.5; // زيادة سرعة الوقت أكثر لجعل الحركة أكثر انسيابية

        // حساب الموجات الأساسية المستخدمة في tree.js
        float primaryWave = sin(uTime * uWindFrequency + windOffset);
        float secondaryWave = sin(2.0 * uTime * uWindFrequency + 1.3 * windOffset);
        float tertiaryWave = sin(5.0 * uTime * uWindFrequency + 1.5 * windOffset);

        // دمج الموجات بنفس الأوزان المستخدمة في tree.js
        float waveCombined = 0.5 * primaryWave + 0.3 * secondaryWave + 0.2 * tertiaryWave;

        // تطبيق تأثير الارتفاع (مثل grass.js)
        float heightEffect = heightFactor;

        // تطبيق تأثير الانحناء (مثل grass.js)
        float bendEffect = bendReduction;

        // استخدام نفس دالة الجيب وجيب التمام المستخدمة في grass.js
        float sinComponent = sin(uTime * uWindFrequency + windOffset);
        float cosComponent = cos(uTime * 1.4 * uWindFrequency + windOffset);

        // دمج المكونات لإنشاء حركة واقعية
        float realisticMovement = waveCombined * sinComponent * cosComponent * heightEffect * bendEffect;

        // إضافة بعض التشويه البسيط لمحاكاة الاضطرابات
        float disturbance = sin(uTime * uWindFrequency * 3.0 + windOffset * 2.0) * 0.05;
        realisticMovement += disturbance;

        // تطبيق الحركة النهائية بنفس القوة المستخدمة في tree.js
        vec3 windSway = uWindStrength * realisticMovement;

        // إضافة قيد لمنع التمدد المفرط
        float maxSway = length(uWindStrength) * 0.3; // Adjusted max sway
        float swayLength = length(windSway);
        if (swayLength > maxSway) {
          windSway = normalize(windSway) * maxSway;
        }

        // تطبيق تأثير الرياح فقط على الإحداثيات النسبية للعشبة وليس على الموقع الأساسي
        vec3 relativeOffset = vec3(0.0);

        // استخدام دالة انتقال سلسة لتجنب أي توقف في الحركة
        float smoothWind = sin(uTime * uWindFrequency + windOffset) * 0.5 + 0.5;
        smoothWind = smoothstep(0.0, 1.0, smoothWind);

        // حساب الانحراف في اتجاه X مع انتقال سلس
        relativeOffset.x = windSway.x * position.y * heightFactor * smoothWind;

        // حساب الانحراف في اتجاه Z مع انتقال سلس
        relativeOffset.z = windSway.z * position.y * heightFactor * smoothWind;

        // إضافة اهتزازات صغيرة دائمة للحركة المستمرة
        float microMovement = sin(uTime * uWindFrequency * 8.0 + windOffset * 3.0) * 0.01;
        relativeOffset.x += microMovement * windSway.x;
        relativeOffset.z += microMovement * windSway.z;

        // الحفاظ على الموقع الأساسي للعشبة وتطبيق الانحناء فقط
        vec3 modifiedPosition = transformed + relativeOffset;
        mvPosition = instanceMatrix * vec4(modifiedPosition, 1.0);
        mvPosition = modelViewMatrix * mvPosition;

        gl_Position = projectionMatrix * mvPosition;
        ` :
        `
        vec4 mvPosition = vec4(transformed, 1.0);

        // حساب موضع النقطة في العالم لتحديد تأثير الرياح
        vec3 worldPos = (modelMatrix * mvPosition).xyz;

        // استخدام simplex2d لتوحيد تأثير الرياح مع العشب
        vec2 worldPos2D = worldPos.xz;
        float windOffset = simplex2d(worldPos2D / uWindScale) * 6.28318; // 2 * PI

        // حساب تأثير الرياح الأساسي - استخدام نفس النهج الموجود في grass.js
        float windEffect = sin(uTime * uWindFrequency + windOffset) *
                         cos(uTime * 1.4 * uWindFrequency + windOffset);

        // تطبيق تأثير الارتفاع - الأجزاء العليا من الزهرة تتأثر أكثر بالرياح
        float heightFactor = position.y;

        // تطبيق الحركة كإزاحة نسبية تعتمد على ارتفاع النقطة
        // استخدام معامل تصغير 0.2 مثلما في grass.js
        vec3 windSway = 0.2 * heightFactor * uWindStrength *
                       windEffect;

        // تطبيق الإزاحة
        vec3 newPosition = transformed;
        newPosition.x += windSway.x;
        newPosition.z += windSway.z;

        // تطبيق المصفوفات
        mvPosition = vec4(newPosition, 1.0);
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
        `;

      shader.vertexShader = shader.vertexShader.replace(
        `#include <project_vertex>`,
        vertexShaderCode
      );

      mat.userData = mat.userData || {};
      mat.userData.shader = shader;
    };
  });
}
