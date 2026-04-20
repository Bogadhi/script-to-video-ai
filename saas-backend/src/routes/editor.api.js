const express = require('express');
const prisma = require('../lib/db');
const { authenticateToken } = require('../middleware/auth');
const PipelineService = require('../services/pipeline.service');
const RenderService = require('../services/render.service');

const router = express.Router();

async function assertProjectAccess(projectId, userId) {
    const project = await prisma.project.findUnique({
        where: { projectName: projectId },
        select: { userId: true, projectName: true },
    });

    if (!project) {
        return { ok: false, status: 404, message: 'Project not found.' };
    }

    if (project.userId !== userId) {
        return { ok: false, status: 403, message: 'Access denied.' };
    }

    return { ok: true, project };
}

router.get('/api/editor/:projectId/draft', authenticateToken, async (req, res) => {
    try {
        const { projectId } = req.params;
        const access = await assertProjectAccess(projectId, req.user.user_id);
        if (!access.ok) {
            return res.status(access.status).json({ message: access.message });
        }

        const manifest = await PipelineService.loadProjectManifest(projectId, { preferDraft: true });
        if (!manifest) {
            return res.status(404).json({ message: 'Draft not found.' });
        }

        return res.json({
            projectId,
            draftStatus: manifest.metadata?.draft_status || 'READY',
            manifest,
        });
    } catch (error) {
        console.error('[Editor Draft Load Error]', error);
        return res.status(500).json({ message: 'Unable to load draft.' });
    }
});

router.post('/api/editor/:projectId/draft', authenticateToken, async (req, res) => {
    try {
        const { projectId } = req.params;
        const access = await assertProjectAccess(projectId, req.user.user_id);
        if (!access.ok) {
            return res.status(access.status).json({ message: access.message });
        }

        const existingManifest = await PipelineService.loadProjectManifest(projectId, { preferDraft: true });
        if (!existingManifest) {
            return res.status(404).json({ message: 'Draft not found.' });
        }

        const sceneEdits = req.body?.sceneEdits || {};
        let updatedManifest = {
            ...existingManifest,
            script: req.body?.script || existingManifest.script,
            metadata: {
                ...(existingManifest.metadata || {}),
                ...(req.body?.metadata || {}),
                draft_status: 'DIRTY',
                last_editor_update_at: new Date().toISOString(),
            },
        };

        updatedManifest = await PipelineService.saveDraftManifest(projectId, updatedManifest);
        for (const [sceneId, patch] of Object.entries(sceneEdits)) {
            updatedManifest = await PipelineService.patchDraftScene(projectId, sceneId, patch);
        }

        return res.json({
            success: true,
            projectId,
            draftStatus: updatedManifest.metadata?.draft_status || 'DIRTY',
            manifest: updatedManifest,
        });
    } catch (error) {
        console.error('[Editor Draft Save Error]', error);
        return res.status(500).json({ message: 'Unable to save draft.' });
    }
});

router.patch('/api/editor/:projectId/scenes/:sceneId', authenticateToken, async (req, res) => {
    try {
        const { projectId, sceneId } = req.params;
        const access = await assertProjectAccess(projectId, req.user.user_id);
        if (!access.ok) {
            return res.status(access.status).json({ message: access.message });
        }

        const manifest = await PipelineService.patchDraftScene(projectId, sceneId, req.body || {});
        return res.json({
            success: true,
            projectId,
            sceneId: Number(sceneId),
            draftStatus: manifest.metadata?.draft_status || 'DIRTY',
            scene: (manifest.scenes || []).find((scene) => Number(scene.scene_id) === Number(sceneId)) || null,
        });
    } catch (error) {
        console.error('[Editor Scene Patch Error]', error);
        return res.status(500).json({ message: error.message || 'Unable to update scene draft.' });
    }
});

router.post('/api/editor/:projectId/rebuild', authenticateToken, async (req, res) => {
    try {
        const { projectId } = req.params;
        const access = await assertProjectAccess(projectId, req.user.user_id);
        if (!access.ok) {
            return res.status(access.status).json({ message: access.message });
        }

        const draftManifest = await PipelineService.loadProjectManifest(projectId, { preferDraft: true });
        if (!draftManifest) {
            return res.status(404).json({ message: 'Draft not found.' });
        }

        const rebuildSceneIds = Array.isArray(req.body?.sceneIds) ? req.body.sceneIds : [];
        const manifest = await PipelineService.run(projectId, draftManifest.script, {
            baseManifest: draftManifest,
            useDraft: true,
            rebuildSceneIds,
            style: req.body?.style || draftManifest.metadata?.style || 'cinematic',
            category: req.body?.category || draftManifest.metadata?.category || 'storytelling',
            draftStatus: rebuildSceneIds.length > 0 ? 'PARTIAL_REBUILD_READY' : 'REBUILD_READY',
        });

        let videoPath = '';
        if (req.body?.render === true) {
            videoPath = await RenderService.render(projectId, manifest);
        }

        return res.json({
            success: true,
            projectId,
            rebuiltSceneIds: rebuildSceneIds.map((value) => Number(value)),
            draftStatus: manifest.metadata?.draft_status || 'REBUILD_READY',
            manifest,
            videoPath,
        });
    } catch (error) {
        console.error('[Editor Rebuild Error]', error);
        return res.status(500).json({ message: 'Unable to rebuild draft.' });
    }
});

module.exports = router;
