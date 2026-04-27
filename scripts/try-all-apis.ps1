<#
.SYNOPSIS
    Test all endpoint format strategies with --print compact.
.DESCRIPTION
    Runs every API endpoint in compact mode to verify format output.
    Write operations use notebook 20250416150019-rl4bcvz.
#>

$ErrorActionPreference = "Continue"
$CLI = "node dist/cli.mjs"
$NB = "20250416150019-rl4bcvz"

function Run-Test {
    param(
        [string]$Label,
        [string]$Cmd
    )
    Write-Host "`n$('─' * 60)" -ForegroundColor DarkGray
    Write-Host "▸ $Label" -ForegroundColor Cyan
    Write-Host "  $Cmd" -ForegroundColor DarkGray
    Write-Host "$('─' * 60)" -ForegroundColor DarkGray
    try {
        $out = Invoke-Expression "$Cmd 2>&1" | Out-String
        Write-Host $out.TrimEnd()
    } catch {
        Write-Host "  ERROR: $_" -ForegroundColor Red
    }
}

function Run-Raw {
    param([string]$Cmd)
    # Capture stdout only, discard stderr (warnings)
    $json = Invoke-Expression "$Cmd 2>$null" | Out-String
    return $json.Trim()
}

# --print json now returns full {code, msg, data} envelope
function Get-Data {
    param([string]$Cmd)
    $raw = Run-Raw $Cmd
    return ($raw | ConvertFrom-Json).data
}

Write-Host "`n$('═' * 60)" -ForegroundColor Yellow
Write-Host "  Endpoint Format Strategy Test — All Endpoints" -ForegroundColor Yellow
Write-Host "$('═' * 60)" -ForegroundColor Yellow

# ════════════════════════════════════════════════════════════
# Phase 1: Bootstrap — gather IDs for dependent tests
# ════════════════════════════════════════════════════════════
Write-Host "`n━━━ Phase 1: Bootstrap ━━━" -ForegroundColor Green

Run-Test "system.version (custom format)" `
    "$CLI api system.version --print compact"

Run-Test "system.currentTime (custom format)" `
    "$CLI api system.currentTime --print compact"

Run-Test "system.bootProgress (json)" `
    "$CLI api system.bootProgress --print compact"

Run-Test "system.getConf (json)" `
    "$CLI api system.getConf --yes --print compact"

Run-Test "notebook.lsNotebooks (records)" `
    "$CLI api notebook.lsNotebooks --print compact"

Run-Test "filetree.listDocsByPath (custom format)" `
    "$CLI api filetree.listDocsByPath --notebook $NB --path / --print compact"

# Pick first doc ID for subsequent tests
$docsData = Get-Data "$CLI api filetree.listDocsByPath --notebook $NB --path / --print json"
$docs = $docsData.files
$testDocId = $docs[0].id
$testDocPath = $docs[0].path
Write-Host "`n  [bootstrap] Using doc: $testDocId ($($docs[0].name))" -ForegroundColor DarkYellow

# ════════════════════════════════════════════════════════════
# Phase 2: direct strategy
# ════════════════════════════════════════════════════════════
Write-Host "`n━━━ Phase 2: direct strategy ━━━" -ForegroundColor Green

Run-Test "filetree.getHPathByID (direct)" `
    "$CLI api filetree.getHPathByID --id $testDocId --print compact"

Run-Test "filetree.getHPathByPath (direct)" `
    "$CLI api filetree.getHPathByPath --notebook $NB --path $testDocPath --print compact"

Run-Test "filetree.getPathByID (direct)" `
    "$CLI api filetree.getPathByID --id $testDocId --print compact"

Run-Test "filetree.getIDsByHPath (direct)" `
    "$CLI api filetree.getIDsByHPath --notebook $NB --path / --print compact"

Run-Test "template.renderSprig (direct)" `
    "$CLI api template.renderSprig --template `"{{.Now}}`" --print compact"

# ════════════════════════════════════════════════════════════
# Phase 3: records strategy
# ════════════════════════════════════════════════════════════
Write-Host "`n━━━ Phase 3: records strategy ━━━" -ForegroundColor Green

# Get a block ID first
$blocksData = Get-Data "$CLI api query.sql --stmt `"SELECT id FROM blocks WHERE root_id = '$testDocId' AND type = 'p' LIMIT 1`" --print json"
$testBlockId = if ($blocksData.Count -gt 0) { $blocksData[0].id } else { $null }
Write-Host "  [bootstrap] Using block: $testBlockId" -ForegroundColor DarkYellow

if ($testBlockId) {
    Run-Test "block.getChildBlocks (records)" `
        "$CLI api block.getChildBlocks --id $testDocId --print compact"

    Run-Test "block.getBlockBreadcrumb (records)" `
        "$CLI api block.getBlockBreadcrumb --id $testBlockId --print compact"
}

Run-Test "filetree.searchDocs (records)" `
    "$CLI api filetree.searchDocs --k test --print compact"

Run-Test "query.sql (custom format)" `
    "$CLI api query.sql `"SELECT id, type, content FROM blocks WHERE root_id = '$testDocId' LIMIT 3`" --print compact"

Run-Test "search.fullTextSearchBlock (custom format)" `
    "$CLI api search.fullTextSearchBlock --query 为什么 --print compact"

# ════════════════════════════════════════════════════════════
# Phase 4: object strategy
# ════════════════════════════════════════════════════════════
Write-Host "`n━━━ Phase 4: object strategy ━━━" -ForegroundColor Green

if ($testBlockId) {
    Run-Test "block.getBlockInfo (object)" `
        "$CLI api block.getBlockInfo --id $testBlockId --print compact"

    Run-Test "block.getBlockDOM (object)" `
        "$CLI api block.getBlockDOM --id $testBlockId --print compact"

    Run-Test "attr.getBlockAttrs (object)" `
        "$CLI api attr.getBlockAttrs --id $testBlockId --print compact"
}

Run-Test "export.exportMdContent (object)" `
    "$CLI api export.exportMdContent --id $testDocId --print compact"

Run-Test "file.readDir (custom format)" `
    "$CLI api file.readDir --path /data/$NB --print compact"

# ════════════════════════════════════════════════════════════
# Phase 5: transaction strategy (write operations)
# ════════════════════════════════════════════════════════════
Write-Host "`n━━━ Phase 5: transaction strategy ━━━" -ForegroundColor Green

# Create a test doc to operate on
Run-Test "filetree.createDocWithMd (direct) [WRITE]" `
    "$CLI api filetree.createDocWithMd --notebook $NB --path /_test_format --markdown `"# Test\n\nHello format test`" --yes --print compact"

# Re-fetch to get the created doc
$docsData2 = Get-Data "$CLI api filetree.listDocsByPath --notebook $NB --path /_test_format --print json"
$docs2 = $docsData2.files
$createdDocId = if ($docs2 -and $docs2.Count -gt 0) { $docs2[0].id } else { $null }
Write-Host "  [bootstrap] Created test doc: $createdDocId" -ForegroundColor DarkYellow

if ($createdDocId) {
    # Append a block
    Run-Test "block.appendBlock (transaction) [WRITE]" `
        "$CLI api block.appendBlock --parentID $createdDocId --data `"Appended block for format test`" --yes --print compact"

    # Get the appended block ID
    $childData = Get-Data "$CLI api block.getChildBlocks --id $createdDocId --print json"
    $appendedBlockId = if ($childData -and $childData.Count -gt 0) { $childData[-1].id } else { $null }
    Write-Host "  [bootstrap] Appended block: $appendedBlockId" -ForegroundColor DarkYellow

    if ($appendedBlockId) {
        Run-Test "block.prependBlock (transaction) [WRITE]" `
            "$CLI api block.prependBlock --parentID $createdDocId --data `"Prepended block`" --yes --print compact"

        Run-Test "block.updateBlock (transaction) [WRITE]" `
            "$CLI api block.updateBlock --id $appendedBlockId --data `"Updated content for format test`" --yes --print compact"

        Run-Test "block.insertBlock (transaction) [WRITE]" `
            "$CLI api block.insertBlock --parentID $createdDocId --previousID $appendedBlockId --data `"Inserted block`" --yes --print compact"

        Run-Test "attr.setBlockAttrs (transaction) [WRITE]" `
            "$CLI api attr.setBlockAttrs --id $appendedBlockId --attrs `"{\`"custom-test\`":\`"format-test\`"}\`" --yes --print compact"

        Run-Test "block.foldBlock (transaction) [WRITE]" `
            "$CLI api block.foldBlock --id $createdDocId --yes --print compact"

        Run-Test "block.unfoldBlock (transaction) [WRITE]" `
            "$CLI api block.unfoldBlock --id $createdDocId --yes --print compact"

        Run-Test "block.deleteBlock (transaction) [WRITE]" `
            "$CLI api block.deleteBlock --id $appendedBlockId --yes --print compact"
    }

    # Doc-level operations
    Run-Test "filetree.renameDocByID (transaction) [WRITE]" `
        "$CLI api filetree.renameDocByID --id $createdDocId --title `"_test_renamed_$(Get-Date -Format 'HHmmss')`" --yes --print compact"

    Run-Test "filetree.removeDocByID (transaction) [WRITE]" `
        "$CLI api filetree.removeDocByID --id $createdDocId --yes --print compact"
}

# File operations
$testFile = "$env:TEMP/_test_format_$(Get-Date -Format 'HHmmss').txt"
Set-Content -Path $testFile -Value "format test content" -NoNewline
$testFileName = Split-Path $testFile -Leaf

Run-Test "file.putFile (transaction) [WRITE]" `
    "$CLI api file.putFile --path /temp/$testFileName --file `"$testFile`" --yes --print compact"

Run-Test "file.removeFile (transaction) [WRITE]" `
    "$CLI api file.removeFile --path /temp/$testFileName --yes --print compact"

# Notebook operations
Run-Test "notebook.openNotebook (transaction) [WRITE]" `
    "$CLI api notebook.openNotebook --notebook $NB --yes --print compact"

# notification (safe — just shows a toast)
Run-Test "notification.pushMsg (transaction)" `
    "$CLI api notification.pushMsg --msg `"Format test notification`" --timeout 1000 --print compact"

Run-Test "notification.pushErrMsg (transaction)" `
    "$CLI api notification.pushErrMsg --msg `"Format test error notification`" --timeout 1000 --print compact"

# sqlite
Run-Test "sqlite.flushTransaction (transaction)" `
    "$CLI api sqlite.flushTransaction --print compact"

# ════════════════════════════════════════════════════════════
# Phase 6: json strategy
# ════════════════════════════════════════════════════════════
Write-Host "`n━━━ Phase 6: json strategy ━━━" -ForegroundColor Green

Run-Test "notebook.getNotebookConf (json)" `
    "$CLI api notebook.getNotebookConf --notebook $NB --print compact"

# ════════════════════════════════════════════════════════════
# Phase 7: existing custom format (should be unaffected)
# ════════════════════════════════════════════════════════════
Write-Host "`n━━━ Phase 7: custom format (existing) ━━━" -ForegroundColor Green

Run-Test "block.getBlockKramdown (custom format)" `
    "$CLI api block.getBlockKramdown --id $testDocId --print compact"

# ════════════════════════════════════════════════════════════
# Phase 8: --print json (verify full envelope)
# ════════════════════════════════════════════════════════════
Write-Host "`n━━━ Phase 8: --print json (full envelope) ━━━" -ForegroundColor Green

Run-Test "system.version --print json" `
    "$CLI api system.version --print json"

Run-Test "block.getBlockInfo --print json" `
    "$CLI api block.getBlockInfo --id $testDocId --print json"

Run-Test "notebook.lsNotebooks --print json" `
    "$CLI api notebook.lsNotebooks --print json"

# ════════════════════════════════════════════════════════════
# Done
# ════════════════════════════════════════════════════════════
Write-Host "`n$('═' * 60)" -ForegroundColor Yellow
Write-Host "  Test complete. Review output above." -ForegroundColor Yellow
Write-Host "$('═' * 60)" -ForegroundColor Yellow
