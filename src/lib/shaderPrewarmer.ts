import * as THREE from 'three';
import { logger } from '../utils/logger';

export class ShaderPrewarmer {
    private static prewarmScene = new THREE.Scene();
    private static prewarmCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 10);

    /**
     * Pre-warms shaders for a set of objects by rendering them once in a hidden scene.
     */
    public static prewarm(renderer: THREE.WebGLRenderer, objects: (THREE.Object3D | null)[]): void {
        if (!renderer) return;

        const startTime = performance.now();
        const validObjects = objects.filter((obj): obj is THREE.Object3D => obj !== null);
        
        if (validObjects.length === 0) return;

        // Save original parent and visibility
        const originalStates = validObjects.map(obj => ({
            obj,
            parent: obj.parent,
            visible: obj.visible,
            position: obj.position.clone()
        }));

        try {
            // Prepare scene
            this.prewarmScene.clear();
            validObjects.forEach((obj, i) => {
                // Ensure visibility and position for rendering
                obj.visible = true;
                obj.position.set(0, 0, -5 - i); // Arrange them
                this.prewarmScene.add(obj);
            });

            // Add basic light to source shaders
            const light = new THREE.DirectionalLight(0xffffff, 1);
            this.prewarmScene.add(light);
            this.prewarmScene.add(new THREE.AmbientLight(0xffffff, 0.5));

            // Force WebGL to compile shaders
            renderer.compile(this.prewarmScene, this.prewarmCamera);
            
            // Optional: Render one frame to hidden buffer just to be absolutely sure
            // renderer.render(this.prewarmScene, this.prewarmCamera);

            logger.log(`[ShaderPrewarmer] Pre-warmed ${validObjects.length} objects in ${Math.round(performance.now() - startTime)}ms`);
        } catch (error) {
            logger.warn("[ShaderPrewarmer] Error during pre-warming:", error);
        } finally {
            // Restore original world states
            originalStates.forEach(({ obj, parent, visible, position }) => {
                if (parent) {
                    parent.add(obj);
                } else {
                    this.prewarmScene.remove(obj);
                }
                obj.visible = visible;
                obj.position.copy(position);
            });
        }
    }
}
