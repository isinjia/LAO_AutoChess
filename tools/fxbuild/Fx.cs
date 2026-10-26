// Bakes projectile / hit-effect prefabs: simulates them frame by frame (particles with a fixed
// seed, animators, sprites, skinned meshes, trails emulated from transform history), writes every
// drawn primitive as triangles in projectile-local space, and renders ground-truth PNGs.
// Jobs (fx_jobs.txt): name|prefab|mode(proj/static)|T|dist|duration|curveKeys(t:v,...)
//   or  name|characterPrefab|clip|clipPath|fires(n=path;..)|duration|eventTimes(t,..)|hasParticles(0/1):
//   the character's own particle systems along an attack / skill clip, and where its _fire<n> are at the events
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;

public static class RefFx
{
    const float FPS = 30f;
    const int SIZE = 384;
    static readonly CultureInfo ci = CultureInfo.InvariantCulture;

    class Item { public string tex; public string shader; public Vector4 st = new Vector4(1, 1, 0, 0); public Color tint; public int layer, order, seq; public List<Vector2> v = new List<Vector2>(); public List<Vector2> uv = new List<Vector2>(); public List<Color> col = new List<Color>(); public List<int> tri = new List<int>(); }

    public static void Run()
    {
        Directory.CreateDirectory("fx");
        foreach (var line in File.ReadAllLines("fx_jobs.txt"))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            try { Bake(line.Split('|')); }
            catch (System.Exception e) { Debug.LogError("FX FAIL " + line + " " + e); }
        }
        EditorApplication.Exit(0);
    }

    // the clip of the controller's default state (what the Animator plays on spawn)
    static AnimationClip DefaultClip(Animator an)
    {
        var ac = an.runtimeAnimatorController as UnityEditor.Animations.AnimatorController;
        if (ac && ac.layers.Length > 0)
        {
            var st = ac.layers[0].stateMachine.defaultState;
            if (st && st.motion is AnimationClip clip) return clip;
        }
        var ctrl = an.runtimeAnimatorController;
        return ctrl && ctrl.animationClips.Length > 0 ? ctrl.animationClips[0] : null;
    }

    static float EvalCurve(List<Vector2> keys, float x)
    {
        if (keys.Count == 0) return x;
        if (x <= keys[0].x) return keys[0].y;
        for (int i = 0; i < keys.Count - 1; i++)
            if (x <= keys[i + 1].x) { float f = (x - keys[i].x) / Mathf.Max(1e-5f, keys[i + 1].x - keys[i].x); return Mathf.Lerp(keys[i].y, keys[i + 1].y, f); }
        return keys[keys.Count - 1].y;
    }

    static int LayerOrder(string name)
    {
        string[] order = { "3D_BG", "FX_back", "Default", "BG_top", "FX_self", "bone_and_ik", "UI", "OverFX" };
        int i = System.Array.IndexOf(order, name); return i < 0 ? 2 : i;
    }

    static Color Prop(Material m, string n, Color d) { return m && m.HasProperty(n) ? m.GetColor(n) : d; }

    static void Bake(string[] p)
    {
        if (p[2] == "clip") { BakeClip(p); return; }
        if (p[2] == "probe") { Probe(p); return; }
        string name = p[0], prefabPath = p[1], mode = p[2];
        float T = float.Parse(p[3], ci), dist = float.Parse(p[4], ci), duration = float.Parse(p[5], ci);
        var curve = new List<Vector2>();
        if (p.Length > 6 && p[6].Length > 0)
            foreach (var kv in p[6].Split(',')) { var a = kv.Split(':'); curve.Add(new Vector2(float.Parse(a[0], ci), float.Parse(a[1], ci))); }
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
        if (!prefab) { Debug.LogError("FX missing prefab " + prefabPath); return; }

        if (duration <= 0)
        {
            // static effects: as long as their particles / animations last
            float d = 0.3f;
            foreach (var ps in prefab.GetComponentsInChildren<ParticleSystem>(true)) d = Mathf.Max(d, ps.main.startDelay.constantMax + (ps.main.loop ? 1f : ps.main.duration) + ps.main.startLifetime.constantMax);
            foreach (var an in prefab.GetComponentsInChildren<Animator>(true)) if (an.runtimeAnimatorController) foreach (var c in an.runtimeAnimatorController.animationClips) d = Mathf.Max(d, c.length);
            duration = Mathf.Min(d, 3f);
        }
        int frames = Mathf.CeilToInt(duration * FPS) + 1;
        var allFrames = new List<List<Item>>();
        var origins = new List<float>();
        Bounds bounds = new Bounds(Vector3.zero, Vector3.one * 0.5f);
        for (int pass = 0; pass < 2; pass++)
        {
            var go = (GameObject)Object.Instantiate(prefab);
            go.transform.position = Vector3.zero;
            go.transform.rotation = Quaternion.identity;
            var systems = go.GetComponentsInChildren<ParticleSystem>(true);
            foreach (var ps in systems) { ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear); ps.useAutoRandomSeed = false; ps.randomSeed = 12345; }
            var anims = go.GetComponentsInChildren<Animator>(true);
            var trails = go.GetComponentsInChildren<TrailRenderer>(true);
            var history = trails.Select(t => new List<KeyValuePair<float, Vector3>>()).ToList();
            Camera cam = null; RenderTexture rt = null; Texture2D tex = null;
            if (pass == 1)
            {
                var cg = new GameObject("cam"); cam = cg.AddComponent<Camera>();
                if (Mathf.Max(bounds.extents.x, bounds.extents.y) * 1.1f > 60f) bounds = new Bounds(bounds.center, new Vector3(108f, 108f, 1f)); // about a battle screen across
                cam.orthographic = true; cam.orthographicSize = Mathf.Max(bounds.extents.x, bounds.extents.y) * 1.1f;
                cam.transform.position = new Vector3(bounds.center.x, bounds.center.y, -50);
                cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = new Color(0, 0, 0, 1);
                cam.nearClipPlane = 0.01f; cam.farClipPlane = 200;
                rt = new RenderTexture(SIZE, SIZE, 24, RenderTextureFormat.ARGB32); cam.targetTexture = rt;
                tex = new Texture2D(SIZE, SIZE, TextureFormat.RGBA32, false);
            }
            else
            {
                // pass 0 measures the framing: particles need a camera to be baked too (without one they were left
                // out and particle-only effects got a 0.55-unit frame)
                var cg = new GameObject("cam"); cam = cg.AddComponent<Camera>();
                cam.orthographic = true; cam.orthographicSize = 10; cam.transform.position = new Vector3(0, 0, -50);
            }
            for (int f = 0; f < frames; f++)
            {
                float t = f / FPS;
                // projectile flight (Projectile.doMove: Lerp(start, goal, curve(t/T)))
                Vector3 pos = Vector3.zero;
                if (mode == "proj") pos = new Vector3(dist * EvalCurve(curve, Mathf.Clamp01(t / Mathf.Max(T, 1e-3f))), 0, 0);
                go.transform.position = pos;
                foreach (var an in anims)
                {
                    var c = DefaultClip(an);
                    if (c) c.SampleAnimation(an.gameObject, c.isLooping ? t % Mathf.Max(c.length, 1e-3f) : Mathf.Min(t, c.length));
                }
                foreach (var ps in systems)
                {
                    if (f == 0) ps.Simulate(0, false, true, true);
                    else ps.Simulate(1f / FPS, false, false, true);
                }
                for (int k = 0; k < trails.Length; k++) history[k].Add(new KeyValuePair<float, Vector3>(t, trails[k].transform.position));
                curCam = cam;
                var items = Collect(go, systems, trails, history, t, pos);
                if (pass == 0)
                {
                    // pass 0 only measures the framing (stray particles far out are never on screen)
                    foreach (var it in items) foreach (var v in it.v) { if (Mathf.Abs(v.x) > 400 || Mathf.Abs(v.y) > 400) continue; bounds.Encapsulate(new Vector3(v.x + pos.x, v.y + pos.y, 0)); }
                }
                else
                {
                    // data and ground-truth image come from the very same simulation step
                    allFrames.Add(items);
                    origins.Add(pos.x);
                }
                if (pass == 1 && f % 2 == 0)
                {
                    var noMat = new List<Renderer>();
                    foreach (var r in go.GetComponentsInChildren<Renderer>(false)) if (r.enabled && !r.sharedMaterial) { r.enabled = false; noMat.Add(r); } // magenta placeholder
                    cam.Render(); RenderTexture.active = rt;
                    tex.ReadPixels(new Rect(0, 0, SIZE, SIZE), 0, 0); tex.Apply(); RenderTexture.active = null;
                    File.WriteAllBytes("fx/" + name + "_" + f + ".png", tex.EncodeToPNG());
                    if (Dual(name))
                    {
                        // the same frame over white: with the black one it gives the effect's own alpha (alpha-blended
                        // shaders do not write alpha), for flipbook playback of effects the mesh bake cannot match
                        cam.backgroundColor = Color.white; cam.Render(); RenderTexture.active = rt;
                        tex.ReadPixels(new Rect(0, 0, SIZE, SIZE), 0, 0); tex.Apply(); RenderTexture.active = null;
                        File.WriteAllBytes("fx/" + name + "_" + f + "_w.png", tex.EncodeToPNG());
                        cam.backgroundColor = new Color(0, 0, 0, 1);
                    }
                    foreach (var r in noMat) r.enabled = true;
                }
            }
            if (cam) Object.DestroyImmediate(cam.gameObject);
            Object.DestroyImmediate(go);
        }
        Write(name, mode, T, dist, duration, curve, bounds, allFrames, origins);
        Debug.Log("FXBAKED " + name + " frames=" + frames);
    }

    // diagnostics: name|characterPrefab|probe|clipPath|frame — what each active particle renderer is at that frame
    static void Probe(string[] p)
    {
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(p[1]);
        var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(p[3]);
        int target = int.Parse(p[4]);
        var go = (GameObject)Object.Instantiate(prefab);
        go.transform.position = Vector3.zero;
        var animator = go.GetComponentInChildren<Animator>(true);
        var animRoot = animator ? animator.gameObject : go;
        var gcs = go.GetComponentsInChildren<Puppet2D.Puppet2D_GlobalControl>(true);
        foreach (var gc in gcs) gc.Refresh();
        var systems = go.GetComponentsInChildren<ParticleSystem>(true);
        foreach (var ps in systems) { ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear); ps.useAutoRandomSeed = false; ps.randomSeed = 12345; }
        var was = new Dictionary<ParticleSystem, bool>();
        for (int f = 0; f <= target; f++)
        {
            clip.SampleAnimation(animRoot, Mathf.Min(f / FPS, clip.length));
            foreach (var gc in gcs) gc.Run();
            foreach (var ps in systems)
            {
                bool act = ps.gameObject.activeInHierarchy; bool before; was.TryGetValue(ps, out before);
                if (act && !before) ps.Simulate(0, false, true, true); else if (act) ps.Simulate(1f / FPS, false, false, true);
                was[ps] = act;
            }
        }
        var sb = new StringBuilder();
        foreach (var ps in systems)
        {
            if (!ps.gameObject.activeInHierarchy || ps.particleCount == 0) continue;
            var r = ps.GetComponent<ParticleSystemRenderer>();
            var arr = new ParticleSystem.Particle[ps.particleCount]; ps.GetParticles(arr);
            float zmin = 1e9f, zmax = -1e9f; Vector3 sz = Vector3.zero; Color32 col = default(Color32);
            foreach (var q in arr) { var wp = ps.main.simulationSpace == ParticleSystemSimulationSpace.World ? q.position : ps.transform.TransformPoint(q.position); zmin = Mathf.Min(zmin, wp.z); zmax = Mathf.Max(zmax, wp.z); sz = q.GetCurrentSize3D(ps); col = q.GetCurrentColor(ps); }
            var cg = new GameObject("cam"); var cam = cg.AddComponent<Camera>(); cam.orthographic = true; cam.transform.position = new Vector3(0, 0, -50);
            var m1 = new Mesh(); r.BakeMesh(m1, cam, ParticleSystemBakeMeshOptions.BakeRotationAndScale | ParticleSystemBakeMeshOptions.BakePosition);
            var m0 = new Mesh(); r.BakeMesh(m0, cam, (ParticleSystemBakeMeshOptions)0);
            Object.DestroyImmediate(cg);
            var tsa = ps.textureSheetAnimation; var streams = new List<ParticleSystemVertexStream>(); r.GetActiveVertexStreams(streams);
            var uvm = ps.GetComponent<ParticleSystemRenderer>();
            var ms = new Mesh[8]; int mc = r.GetMeshes(ms);
            sb.AppendLine("  meshes=" + mc + " [" + string.Join(",", ms.Take(mc).Select(x => x ? x.name + ":" + x.vertexCount : "null")) + "] alignment=" + r.alignment + " pivot=" + r.pivot + " flip=" + r.flip + " startRot3D=" + ps.main.startRotation3D + " startRot=" + ps.main.startRotationX.constant + "," + ps.main.startRotationY.constant + "," + ps.main.startRotationZ.constant + " shapeEnabled=" + ps.shape.enabled + " shape=" + ps.shape.shapeType + " velocity=" + ps.velocityOverLifetime.enabled + " p0=" + (ps.particleCount > 0 ? arr[0].position + " rot3=" + arr[0].rotation3D + " vel=" + arr[0].velocity + " age=" + (arr[0].startLifetime - arr[0].remainingLifetime) : ""));
            sb.AppendLine("  tsa enabled=" + tsa.enabled + " mode=" + tsa.mode + " tiles=" + tsa.numTilesX + "x" + tsa.numTilesY + " anim=" + tsa.animation + " meshV=" + (r.mesh ? r.mesh.vertexCount : -1) + " bakedV=" + m1.vertexCount + " streams=" + string.Join(",", streams) + " custom=" + ps.customData.enabled + " rotOverLife=" + ps.rotationOverLifetime.enabled + " sep=" + ps.rotationOverLifetime.separateAxes + " colorOverLife=" + ps.colorOverLifetime.enabled + " uvMat_ST=" + (r.sharedMaterial ? r.sharedMaterial.mainTextureScale + "/" + r.sharedMaterial.mainTextureOffset : ""));
            sb.AppendLine("  bake(world) bounds=" + m1.bounds + "  bake(none) bounds=" + m0.bounds + " pos=" + ps.transform.position + " rot=" + ps.transform.rotation.eulerAngles + " localScale=" + ps.transform.localScale + " simSpace=" + ps.main.simulationSpace);
            sb.AppendLine(ps.name + " n=" + ps.particleCount + " enabled=" + r.enabled + " mode=" + r.renderMode + " bounds=" + r.bounds + " z=[" + zmin + "," + zmax + "] size=" + sz + " col=" + col + " lossyScale=" + ps.transform.lossyScale + " scaling=" + ps.main.scalingMode + " mat=" + (r.sharedMaterial ? r.sharedMaterial.name + "/" + r.sharedMaterial.shader.name : "none") + " sortLayer=" + r.sortingLayerName + " goLayer=" + ps.gameObject.layer);
        }
        File.WriteAllText("fx/" + p[0] + ".probe.txt", sb.ToString());
        Object.DestroyImmediate(go);
        Debug.Log("FXPROBE " + p[0]);
    }

    // the character's particle systems along one clip (the web rig draws its sprites / meshes itself)
    static void BakeClip(string[] p)
    {
        string name = p[0];
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(p[1]);
        var clip = AssetDatabase.LoadAssetAtPath<AnimationClip>(p[3]);
        if (!prefab || !clip) { Debug.LogError("FX missing clip job " + p[1] + " " + p[3]); return; }
        float duration = Mathf.Min(float.Parse(p[5], ci), clip.length + 1.5f);
        bool hasPs = p.Length > 7 && p[7] == "1";
        var go = (GameObject)Object.Instantiate(prefab);
        go.transform.position = Vector3.zero; go.transform.rotation = Quaternion.identity;
        // clip paths are relative to the Animator's object; Puppet2D IK runs after each sample (as in LateUpdate)
        var animator = go.GetComponentInChildren<Animator>(true);
        var animRoot = animator ? animator.gameObject : go;
        var gcs = go.GetComponentsInChildren<Puppet2D.Puppet2D_GlobalControl>(true);
        foreach (var gc in gcs) gc.Refresh();
        System.Action<float> sample = (tt) => { clip.SampleAnimation(animRoot, tt); foreach (var gc in gcs) gc.Run(); };
        // where each _fire<n> is at every projectile event
        var fires = new Dictionary<int, Transform>();
        if (p[4].Length > 0)
            foreach (var kv in p[4].Split(';')) { var a = kv.Split(new[] { '=' }, 2); var tr = go.transform.Find(a[1]); if (tr) fires[int.Parse(a[0])] = tr; }
        var sbF = new StringBuilder("{");
        bool firstF = true;
        if (p[6].Length > 0 && fires.Count > 0)
            foreach (var ts in p[6].Split(','))
            {
                float t = float.Parse(ts, ci);
                sample(t);
                if (!firstF) sbF.Append(',');
                firstF = false;
                sbF.Append('"').Append(t.ToString("0.####", ci)).Append("\":{");
                sbF.Append(string.Join(",", fires.Select(f => "\"" + f.Key + "\":[" + f.Value.position.x.ToString("0.####", ci) + "," + f.Value.position.y.ToString("0.####", ci) + "]")));
                sbF.Append('}');
            }
        sbF.Append('}');
        File.WriteAllText("fx/" + name + ".fire.json", sbF.ToString());
        // the same moments: every ancestor of each _fire<n> (name, world x, y), so the web rig's pose can be checked
        // against Unity on bones the web rig keeps (tools/fxbuild/fxsync.html)
        var sbA = new StringBuilder("{");
        bool firstA = true;
        if (p[6].Length > 0 && fires.Count > 0)
            foreach (var ts in p[6].Split(','))
            {
                float t = float.Parse(ts, ci);
                sample(t);
                if (!firstA) sbA.Append(',');
                firstA = false;
                sbA.Append('"').Append(t.ToString("0.####", ci)).Append("\":{");
                sbA.Append(string.Join(",", fires.Select(f => {
                    var parts = new List<string>();
                    for (var a2 = f.Value.parent; a2 != null && a2 != go.transform; a2 = a2.parent)
                        parts.Add("[\"" + a2.name.Replace("\"", "") + "\"," + a2.position.x.ToString("0.####", ci) + "," + a2.position.y.ToString("0.####", ci) + "]");
                    return "\"" + f.Key + "\":[" + string.Join(",", parts) + "]";
                })));
                sbA.Append('}');
            }
        sbA.Append('}');
        File.WriteAllText("fx/" + name + ".anc.json", sbA.ToString());
        Object.DestroyImmediate(go);
        if (!hasPs) { Debug.Log("FXBAKED " + name + " fires only"); return; }
        // pass 0 measures the framing, pass 1 records the data and the ground-truth renders (particles only) from the
        // very same simulation (fixed seeds), every other frame like the effect jobs
        int frames = Mathf.CeilToInt(duration * FPS) + 1;
        var allFrames = new List<List<Item>>();
        var origins = new List<float>();
        Bounds bounds = new Bounds(Vector3.zero, Vector3.one * 0.5f);
        bool any = false;
        for (int pass = 0; pass < 2; pass++)
        {
            go = (GameObject)Object.Instantiate(prefab);
            go.transform.position = Vector3.zero; go.transform.rotation = Quaternion.identity;
            animator = go.GetComponentInChildren<Animator>(true);
            animRoot = animator ? animator.gameObject : go;
            gcs = go.GetComponentsInChildren<Puppet2D.Puppet2D_GlobalControl>(true);
            foreach (var gc in gcs) gc.Refresh();
            var systems = go.GetComponentsInChildren<ParticleSystem>(true);
            foreach (var ps in systems) { ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear); ps.useAutoRandomSeed = false; ps.randomSeed = 12345; }
            var was = new Dictionary<ParticleSystem, bool>();
            var trails = new TrailRenderer[0];
            var history = new List<List<KeyValuePair<float, Vector3>>>();
            var cg = new GameObject("cam"); var cam = cg.AddComponent<Camera>();
            cam.orthographic = true; cam.nearClipPlane = 0.01f; cam.farClipPlane = 200;
            cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = new Color(0, 0, 0, 1);
            RenderTexture rt = null; Texture2D tex = null;
            if (pass == 0) { cam.orthographicSize = 10; cam.transform.position = new Vector3(0, 0, -50); }
            else
            {
                // at most about a battle screen across (60 units half): wider framings make the content a few pixels
                if (Mathf.Max(bounds.extents.x, bounds.extents.y) * 1.1f > 60f) bounds = new Bounds(bounds.center, new Vector3(108f, 108f, 1f));
                cam.orthographicSize = Mathf.Max(bounds.extents.x, bounds.extents.y) * 1.1f;
                cam.transform.position = new Vector3(bounds.center.x, bounds.center.y, -50);
                rt = new RenderTexture(SIZE, SIZE, 24, RenderTextureFormat.ARGB32); cam.targetTexture = rt;
                tex = new Texture2D(SIZE, SIZE, TextureFormat.RGBA32, false);
            }
            curCam = cam;
            for (int f = 0; f < frames; f++)
            {
                float t = f / FPS;
                clip.SampleAnimation(animRoot, Mathf.Min(t, clip.length));
                foreach (var gc in gcs) gc.Run();
                foreach (var ps in systems)
                {
                    bool act = ps.gameObject.activeInHierarchy;
                    bool before; was.TryGetValue(ps, out before);
                    if (act && !before) ps.Simulate(0, false, true, true);       // switched on by the clip: starts over
                    else if (act) ps.Simulate(1f / FPS, false, false, true);
                    was[ps] = act;
                }
                var items = Collect(go, systems, trails, history, t, Vector3.zero, true);
                // framing: what can be on the battle screen (stray particles thousands of units out are not)
                if (pass == 0) { foreach (var it in items) foreach (var v in it.v) { if (Mathf.Abs(v.x) > 400 || Mathf.Abs(v.y) > 400) continue; bounds.Encapsulate(new Vector3(v.x, v.y, 0)); any = true; } continue; }
                allFrames.Add(items);
                origins.Add(0);
                if (f % 2 == 0)
                {
                    // the rig is drawn by the web runtime: the reference shows the particles alone
                    var hidden = new List<Renderer>();
                    foreach (var r in go.GetComponentsInChildren<Renderer>(false)) if (r.enabled && (!(r is ParticleSystemRenderer) || !r.sharedMaterial)) { r.enabled = false; hidden.Add(r); } // no material: Unity's magenta placeholder, not drawn by the game
                    cam.Render(); RenderTexture.active = rt;
                    tex.ReadPixels(new Rect(0, 0, SIZE, SIZE), 0, 0); tex.Apply(); RenderTexture.active = null;
                    File.WriteAllBytes("fx/" + name + "_" + f + ".png", tex.EncodeToPNG());
                    if (Dual(name))
                    {
                        cam.backgroundColor = Color.white; cam.Render(); RenderTexture.active = rt;
                        tex.ReadPixels(new Rect(0, 0, SIZE, SIZE), 0, 0); tex.Apply(); RenderTexture.active = null;
                        File.WriteAllBytes("fx/" + name + "_" + f + "_w.png", tex.EncodeToPNG());
                        cam.backgroundColor = new Color(0, 0, 0, 1);
                    }
                    foreach (var r in hidden) r.enabled = true;
                }
            }
            Object.DestroyImmediate(cg);
            Object.DestroyImmediate(go);
            if (pass == 0 && !any) { Debug.Log("FXBAKED " + name + " no particles drawn"); return; }
        }
        // trailing empty frames are cut
        int last = allFrames.FindLastIndex(fr => fr.Count > 0);
        if (last >= 0 && last < allFrames.Count - 1) { allFrames.RemoveRange(last + 1, allFrames.Count - last - 1); origins.RemoveRange(last + 1, origins.Count - last - 1); }
        Write(name, "clip", 0, 0, allFrames.Count / FPS, new List<Vector2>(), bounds, allFrames, origins);
        Debug.Log("FXBAKED " + name + " frames=" + allFrames.Count);
    }

    static void AddQuad(Item it, Vector2 c, Vector2 ax, Vector2 ay, Vector4 uvRect, Color col)
    {
        int b = it.v.Count;
        it.v.Add(c - ax - ay); it.v.Add(c + ax - ay); it.v.Add(c + ax + ay); it.v.Add(c - ax + ay);
        it.uv.Add(new Vector2(uvRect.x, uvRect.y)); it.uv.Add(new Vector2(uvRect.z, uvRect.y)); it.uv.Add(new Vector2(uvRect.z, uvRect.w)); it.uv.Add(new Vector2(uvRect.x, uvRect.w));
        for (int i = 0; i < 4; i++) it.col.Add(col);
        it.tri.Add(b); it.tri.Add(b + 1); it.tri.Add(b + 2); it.tri.Add(b); it.tri.Add(b + 2); it.tri.Add(b + 3);
    }

    static Item NewItem(Renderer r, Material m, int seq)
    {
        var it = new Item();
        // animated material values live in the renderer's property block
        var mpb = new MaterialPropertyBlock();
        r.GetPropertyBlock(mpb);
        System.Func<string, Color, Color> C = (n, d) => !mpb.isEmpty && mpb.HasColor(n) ? mpb.GetColor(n) : (m && m.HasProperty(n) ? m.GetColor(n) : d);
        System.Func<string, float, float> Fl = (n, d) => !mpb.isEmpty && mpb.HasFloat(n) ? mpb.GetFloat(n) : (m && m.HasProperty(n) ? m.GetFloat(n) : d);
        Texture mt = null;
        string tprop = "_MainTex";
        if (m)
        {
            if (!mpb.isEmpty && mpb.HasTexture("_MainTex") && mpb.GetTexture("_MainTex")) mt = mpb.GetTexture("_MainTex");
            else if (m.HasProperty("_MainTex") && m.mainTexture) mt = m.mainTexture;
            else if (m.HasProperty("_texture")) { mt = m.GetTexture("_texture"); tprop = "_texture"; }
            if (!mt) foreach (var tp in m.GetTexturePropertyNames()) { var tx = m.GetTexture(tp); if (tx) { mt = tx; tprop = tp; break; } } // custom shaders (Amplify / Shader Forge)
            // the texture's tiling / offset (TRANSFORM_TEX); animated values (scrolling) live in the property block
            if (!mpb.isEmpty && mpb.HasVector(tprop + "_ST")) it.st = mpb.GetVector(tprop + "_ST");
            else if (m.HasProperty(tprop)) { var sc = m.GetTextureScale(tprop); var of = m.GetTextureOffset(tprop); it.st = new Vector4(sc.x, sc.y, of.x, of.y); }
        }
        it.tex = mt ? AssetDatabase.GetAssetPath(mt) : "";
        it.shader = m && m.shader ? m.shader.name : "";
        // material-driven blending (LO shaders: Blend [_Src][_Dst]): appended to the shader name for the converter
        if (m && m.HasProperty("_Dst")) it.shader += "#" + (int)m.GetFloat("_Src") + "," + (int)m.GetFloat("_Dst");
        else if (m && m.HasProperty("_DstBlend")) it.shader += "#" + (int)m.GetFloat("_SrcBlend") + "," + (int)m.GetFloat("_DstBlend");
        // face culling chosen by the material (Cull [_Cull]: 0 off, 1 front, 2 back): the converter drops those faces
        if (m && m.HasProperty("_Cull")) it.shader += "|c" + (int)m.GetFloat("_Cull");
        bool particleShader = it.shader.Contains("Particles");
        it.tint = m && m.HasProperty("_TintColor") ? C("_TintColor", Color.white) * (particleShader ? 2f : 1f) : C("_Color", Color.white);
        if (m && m.HasProperty("_SecondColour")) { var s2 = C("_SecondColour", Color.white); it.tint = new Color(it.tint.r * s2.r, it.tint.g * s2.g, it.tint.b * s2.b, it.tint.a); }
        if (m && m.HasProperty("_AdditionalAlpha")) it.tint.a *= Fl("_AdditionalAlpha", 1);
        if (it.shader.Contains("bori_hide") && Fl("_change", 0) > 0.5f) it.tint.a = 0;
        it.layer = LayerOrder(r.sortingLayerName); it.order = r.sortingOrder; it.seq = seq;
        return it;
    }

    static HashSet<string> dual;
    static bool Dual(string name) { if (dual == null) dual = new HashSet<string>(File.Exists("fx_dual.txt") ? File.ReadAllLines("fx_dual.txt") : new string[0]); return dual.Contains(name); }

    static Camera curCam;

    // Mesh particles: the renderer applies the texture sheet animation per particle when it draws them, BakeMesh
    // leaves the mesh's own uvs. Each particle's vertex block gets its current sheet tile (grid mode, whole sheet
    // or single row), from the frame-over-time curve at its age.
    static void SheetUVs(ParticleSystem ps, ParticleSystemRenderer pr, Mesh baked)
    {
        var tsa = ps.textureSheetAnimation;
        if (!tsa.enabled || tsa.mode != ParticleSystemAnimationMode.Grid || !pr.mesh) return;
        int nv = pr.mesh.vertexCount, n = ps.particleCount;
        if (nv == 0 || baked.vertexCount != nv * n) return;
        var arr = new ParticleSystem.Particle[n];
        ps.GetParticles(arr);
        int tx = Mathf.Max(1, tsa.numTilesX), ty = Mathf.Max(1, tsa.numTilesY);
        bool row = tsa.animation == ParticleSystemAnimationType.SingleRow;
        int frames = row ? tx : tx * ty;
        var uv = baked.uv;
        var src = pr.mesh.uv;
        if (uv.Length != baked.vertexCount || src.Length != nv) return;
        for (int i = 0; i < n; i++)
        {
            var q = arr[i];
            float age = q.startLifetime > 0 ? 1f - q.remainingLifetime / q.startLifetime : 0;
            float cyc = Mathf.Max(1, tsa.cycleCount);
            float t = (age * cyc) % 1f;
            float rnd = (q.randomSeed % 10000) / 10000f;
            float fo = tsa.frameOverTime.Evaluate(t, rnd);
            float st = tsa.startFrame.Evaluate(age, rnd);
            int f = Mathf.Clamp(Mathf.FloorToInt((fo + st / Mathf.Max(1, frames)) * frames) % frames, 0, frames - 1);
            int col = f % tx, rowIdx = row ? (tsa.useRandomRow ? (int)(q.randomSeed % (uint)ty) : tsa.rowIndex) : f / tx;
            float u0 = col / (float)tx, v0 = 1f - (rowIdx + 1) / (float)ty;
            for (int j = 0; j < nv; j++) uv[i * nv + j] = new Vector2(u0 + src[j].x / tx, v0 + src[j].y / ty);
        }
        baked.uv = uv;
    }

    static void AddMesh(List<Item> items, Renderer r, Material m, Mesh mesh, int sub, int seq, Vector3 origin)
    {
        if (mesh.vertexCount == 0 || sub >= mesh.subMeshCount) return;
        var it = NewItem(r, m, seq);
        var v = mesh.vertices; var uv = mesh.uv; var c = mesh.colors32;
        for (int i = 0; i < v.Length; i++)
        {
            it.v.Add(new Vector2(v[i].x - origin.x, v[i].y - origin.y));
            it.uv.Add(i < uv.Length ? uv[i] : Vector2.zero);
            it.col.Add(c.Length == v.Length ? (Color)c[i] : Color.white);
        }
        it.tri.AddRange(mesh.GetTriangles(sub));
        items.Add(it);
    }

    static List<Item> Collect(GameObject go, ParticleSystem[] systems, TrailRenderer[] trails, List<List<KeyValuePair<float, Vector3>>> history, float t, Vector3 origin, bool particlesOnly = false)
    {
        var items = new List<Item>();
        int seq = 0;
        foreach (var r in go.GetComponentsInChildren<Renderer>(false))
        {
            if (!r.enabled || !r.gameObject.activeInHierarchy) continue;
            seq++;
            if (particlesOnly && !(r is ParticleSystemRenderer)) continue; // the rig itself is drawn by the web runtime
            if (r is SpriteRenderer sr)
            {
                if (!sr.sprite) continue;
                var it = NewItem(r, sr.sharedMaterial, seq);
                it.tex = AssetDatabase.GetAssetPath(sr.sprite.texture);
                var m = sr.transform.localToWorldMatrix;
                var sv = sr.sprite.vertices; var suv = sr.sprite.uv; var st = sr.sprite.triangles;
                float fx = sr.flipX ? -1 : 1, fy = sr.flipY ? -1 : 1;
                foreach (var v in sv) { var w = m.MultiplyPoint3x4(new Vector3(v.x * fx, v.y * fy, 0)); it.v.Add(new Vector2(w.x - origin.x, w.y - origin.y)); it.col.Add(sr.color); }
                it.uv.AddRange(suv);
                foreach (var i in st) it.tri.Add(i);
                items.Add(it);
            }
            else if (r is ParticleSystemRenderer pr)
            {
                // exactly what Unity draws: billboards / stretched / mesh particles, sheet uvs, colours, size caps
                if (!curCam) continue;
                var ps = pr.GetComponent<ParticleSystem>();
                if (!ps || ps.particleCount == 0) continue;
                var mesh = new Mesh();
                if (ps.main.simulationSpace == ParticleSystemSimulationSpace.Local && pr.renderMode == ParticleSystemRenderMode.Mesh)
                {
                    // BakeMesh does not apply the transform's rotation to local-space systems (it only offsets them),
                    // while the renderer draws them rotated: bake untransformed and apply the transform as the
                    // renderer does (scaling mode Local: the system's own scale; Hierarchy: the full world scale)
                    pr.BakeMesh(mesh, curCam, (ParticleSystemBakeMeshOptions)0);
                    var ptr = ps.transform;
                    var M = ps.main.scalingMode == ParticleSystemScalingMode.Hierarchy ? ptr.localToWorldMatrix : Matrix4x4.TRS(ptr.position, ptr.rotation, ptr.localScale);
                    var vv = mesh.vertices;
                    for (int i = 0; i < vv.Length; i++) vv[i] = M.MultiplyPoint3x4(vv[i]);
                    mesh.vertices = vv;
                }
                else pr.BakeMesh(mesh, curCam, ParticleSystemBakeMeshOptions.BakeRotationAndScale | ParticleSystemBakeMeshOptions.BakePosition);
                if (pr.renderMode == ParticleSystemRenderMode.Mesh) SheetUVs(ps, pr, mesh);
                AddMesh(items, r, pr.sharedMaterial, mesh, 0, seq, origin);
                if (mesh.subMeshCount > 1 && pr.trailMaterial) AddMesh(items, r, pr.trailMaterial, mesh, 1, seq, origin);
                Object.DestroyImmediate(mesh);
            }
            else if (r is SkinnedMeshRenderer smr || r is MeshRenderer)
            {
                Mesh mesh = null;
                if (r is SkinnedMeshRenderer s2) { if (!s2.sharedMesh) continue; mesh = new Mesh(); s2.BakeMesh(mesh, true); }
                else { var mf = r.GetComponent<MeshFilter>(); if (!mf || !mf.sharedMesh) continue; mesh = mf.sharedMesh; }
                var it = NewItem(r, r.sharedMaterial, seq);
                var tr = r.transform;
                bool skinned = r is SkinnedMeshRenderer;
                var cols = mesh.colors;
                var vv = mesh.vertices;
                for (int i = 0; i < vv.Length; i++)
                {
                    var w = skinned ? tr.position + tr.rotation * vv[i] : tr.localToWorldMatrix.MultiplyPoint3x4(vv[i]);
                    it.v.Add(new Vector2(w.x - origin.x, w.y - origin.y));
                    it.col.Add(cols.Length == vv.Length ? cols[i] : Color.white);
                }
                var muv = mesh.uv; for (int i = 0; i < vv.Length; i++) it.uv.Add(i < muv.Length ? muv[i] : Vector2.zero);
                it.tri.AddRange(mesh.triangles);
                items.Add(it);
            }
        }
        // trails: Unity's own trail mesh (world space)
        for (int k = 0; k < trails.Length; k++)
        {
            var tr = trails[k];
            if (!tr.enabled || !tr.gameObject.activeInHierarchy || !curCam) continue;
            var mesh = new Mesh();
            tr.BakeMesh(mesh, curCam, false);
            var before = items.Count;
            AddMesh(items, tr, tr.sharedMaterial, mesh, 0, 9999 + k, origin);
            Object.DestroyImmediate(mesh);
        }
        return items;
    }

    static void Write(string name, string mode, float T, float dist, float duration, List<Vector2> curve, Bounds b, List<List<Item>> frames, List<float> origins)
    {
        var texs = new List<string>(); var shaders = new List<string>();
        var sb = new StringBuilder();
        sb.Append("{\"name\":\"").Append(name).Append("\",\"mode\":\"").Append(mode).Append("\",\"T\":").Append(T.ToString(ci))
          .Append(",\"dist\":").Append(dist.ToString(ci)).Append(",\"fps\":").Append(FPS.ToString(ci))
          .Append(",\"cx\":").Append(b.center.x.ToString(ci)).Append(",\"cy\":").Append(b.center.y.ToString(ci))
          .Append(",\"half\":").Append((Mathf.Max(b.extents.x, b.extents.y) * 1.1f).ToString(ci))
          .Append(",\"org\":[").Append(string.Join(",", origins.Select(o => o.ToString("0.####", ci)))).Append("]")
          .Append(",\"frames\":[");
        for (int f = 0; f < frames.Count; f++)
        {
            if (f > 0) sb.Append(',');
            sb.Append('[');
            var items = frames[f].OrderBy(i => i.layer).ThenBy(i => i.order).ThenBy(i => i.seq).ToList();
            for (int k = 0; k < items.Count; k++)
            {
                var it = items[k];
                int ti = texs.IndexOf(it.tex); if (ti < 0) { texs.Add(it.tex); ti = texs.Count - 1; }
                int si = shaders.IndexOf(it.shader); if (si < 0) { shaders.Add(it.shader); si = shaders.Count - 1; }
                if (k > 0) sb.Append(',');
                sb.Append("{\"t\":").Append(ti).Append(",\"s\":").Append(si).Append(",\"tr\":").Append(it.seq >= 9999 ? 1 : 0)
                  .Append(",\"st\":[").Append(it.st.x.ToString("0.####", ci)).Append(',').Append(it.st.y.ToString("0.####", ci)).Append(',').Append(it.st.z.ToString("0.####", ci)).Append(',').Append(it.st.w.ToString("0.####", ci)).Append("]")
                  .Append(",\"k\":[").Append(it.tint.r.ToString("0.###", ci)).Append(',').Append(it.tint.g.ToString("0.###", ci)).Append(',').Append(it.tint.b.ToString("0.###", ci)).Append(',').Append(it.tint.a.ToString("0.###", ci)).Append("]")
                  .Append(",\"v\":[").Append(string.Join(",", it.v.Select(v => v.x.ToString("0.####", ci) + "," + v.y.ToString("0.####", ci)))).Append(']')
                  .Append(",\"u\":[").Append(string.Join(",", it.uv.Select(v => v.x.ToString("0.####", ci) + "," + v.y.ToString("0.####", ci)))).Append(']')
                  .Append(",\"c\":[").Append(string.Join(",", it.col.Select(c => ((int)(c.r * 255)).ToString() + "," + ((int)(c.g * 255)) + "," + ((int)(c.b * 255)) + "," + ((int)(c.a * 255))))).Append(']')
                  .Append(",\"i\":[").Append(string.Join(",", it.tri)).Append("]}");
            }
            sb.Append(']');
        }
        sb.Append("],\"textures\":[").Append(string.Join(",", texs.Select(s => "\"" + s + "\""))).Append("],\"shaders\":[")
          .Append(string.Join(",", shaders.Select(s => "\"" + s + "\""))).Append("]}");
        File.WriteAllText("fx/" + name + ".json", sb.ToString());
    }
}
