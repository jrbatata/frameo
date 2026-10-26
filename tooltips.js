const tooltip = document.getElementById('tooltip');
let tooltipTarget;

function hideTooltip() {
    tooltip.hidden = true;
    tooltipTarget = undefined;
}

function showTooltip(target) {
    if (!target?.dataset.tooltip) return;
    tooltipTarget = target;
    tooltip.textContent = target.dataset.tooltip;
    tooltip.hidden = false;
    const anchor = target.getBoundingClientRect();
    const bounds = tooltip.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.left + (anchor.width - bounds.width) / 2, window.innerWidth - bounds.width - 8));
    const below = anchor.bottom + 7;
    const top = below + bounds.height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - bounds.height - 7);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

document.addEventListener('pointerover', event => {
    const target = event.target.closest('[data-tooltip]');
    if (target && target !== tooltipTarget) showTooltip(target);
});
document.addEventListener('pointerout', event => {
    if (tooltipTarget && !tooltipTarget.contains(event.relatedTarget)) hideTooltip();
});
document.addEventListener('focusin', event => showTooltip(event.target.closest('[data-tooltip]')));
document.addEventListener('focusout', hideTooltip);
document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); });
document.addEventListener('click', hideTooltip);
window.addEventListener('blur', hideTooltip);
window.addEventListener('resize', hideTooltip);
document.addEventListener('scroll', hideTooltip, true);
