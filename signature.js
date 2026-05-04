// ==========================================
// INTELIGÊNCIA DAS ASSINATURAS (CANVAS)
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    inicializarAssinaturas();
});

function inicializarAssinaturas() {
    const canvases = document.querySelectorAll('.sig-canvas');
    
    canvases.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        let isDrawing = false;

        // Ajusta a resolução interna do canvas para bater com o CSS (Evita distorção)
        function calibrarCanvas() {
            const rect = canvas.getBoundingClientRect();
            // Só ajusta se ele estiver visível e se o tamanho interno estiver diferente do real
            if (rect.width > 0 && canvas.width !== Math.round(rect.width)) {
                canvas.width = rect.width;
                canvas.height = 150; // Altura padrão para todos os campos
                
                // Preenche com fundo branco para não dar erro no Supabase
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }

        // Calibra a caneta toda vez que o mouse/dedo entra no quadro
        canvas.addEventListener('mouseenter', calibrarCanvas);
        canvas.addEventListener('touchstart', calibrarCanvas, { passive: true });

        // Captura a posição exata da caneta (Mouse ou Touch)
        function getCoordinates(e) {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            // Calcula a proporção exata
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            return {
                x: (clientX - rect.left) * scaleX,
                y: (clientY - rect.top) * scaleY
            };
        }

        // EVENTOS DE DESENHO
        function startDrawing(e) {
            if (e.cancelable) e.preventDefault(); // Evita a tela rolar no celular
            calibrarCanvas();
            isDrawing = true;
            const pos = getCoordinates(e);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#000000';
        }

        function draw(e) {
            if (!isDrawing) return;
            if (e.cancelable) e.preventDefault(); // Evita a tela rolar no celular
            const pos = getCoordinates(e);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        }

        function stopDrawing() {
            isDrawing = false;
            ctx.closePath();
        }

        // Mouse (Computador)
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);

        // Touch (Celular/Tablet)
        canvas.addEventListener('touchstart', startDrawing, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        canvas.addEventListener('touchend', stopDrawing);
        canvas.addEventListener('touchcancel', stopDrawing);

        // Inicialização padrão
        setTimeout(calibrarCanvas, 500); 
    });
}

// Botão "Limpar Assinatura"
function limparCanvas(idCanvas) {
    const canvas = document.getElementById(idCanvas);
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

// Função que envia a imagem gerada para o Supabase
async function uploadAssinatura(canvas, prefixo) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
            if (!blob) return reject(new Error("Falha ao gerar a assinatura. Tente desenhar novamente."));
            
            const fileName = `assinatura_${prefixo}_${Date.now()}.png`;
            
            try {
                // Envia para o bucket "assinaturas" no Supabase
                const { data, error } = await supabase.storage
                    .from('assinaturas')
                    .upload(fileName, blob, {
                        cacheControl: '3600',
                        upsert: false
                    });
                    
                if (error) throw error;
                
                // Pega a URL pública para salvar no banco de dados
                const { data: urlData } = supabase.storage
                    .from('assinaturas')
                    .getPublicUrl(fileName);
                    
                resolve(urlData.publicUrl);
            } catch (err) {
                reject(err);
            }
        }, 'image/png');
    });
}
