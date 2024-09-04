console.log('app.js загружен');

// Функция для получения текущей цены акций через API Московской биржи
async function getCurrentPrice(stockIds) {
    const stocks = stockIds.split(',');
    const results = {};

    for (const stock of stocks) {
        const url = `https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/${stock}.json?iss.meta=off&iss.only=securities,marketdata&securities.columns=SECID,PREVPRICE&marketdata.columns=LAST`;
        console.log(`Запрос к URL: ${url}`);
        
        try {
            const response = await fetch(url);
            console.log('Ответ получен:', response);
            const data = await response.json();
            console.log('Данные получены:', data);

            if (data.securities && data.securities.data && data.securities.data.length > 0 &&
                data.marketdata && data.marketdata.data && data.marketdata.data.length > 0) {
                const prevPrice = data.securities.data[0][1];
                const currentPrice = data.marketdata.data[0][0] || prevPrice;

                results[stock] = {
                    rub: currentPrice,
                    prev_rub: prevPrice
                };
            } else {
                console.error(`Неверный формат данных для ${stock}`);
                results[stock] = null;
            }
        } catch (error) {
            console.error(`Ошибка при получении цены для ${stock}:`, error);
            results[stock] = null;
        }
    }

    return results;
}

// Функция для предсказания цены на основе последовательностей
async function predictPrice(sequences, updateProgress) {
    const hiddenNeurons = parseInt(document.getElementById('hidden-neurons').value);
    const iterations = parseInt(document.getElementById('iterations').value);
    const batchSize = parseInt(document.getElementById('batch-size').value);
    const learningRate = parseFloat(document.getElementById('learning-rate').value) / 10000;
    const errorThresh = parseFloat(document.getElementById('error-thresh').value) / 1000;

    const net = new brain.recurrent.LSTMTimeStep({
        inputSize: 1,
        hiddenLayers: [hiddenNeurons],
        outputSize: 1
    });
    const trainingData = sequences.map(seq => seq[0]);
    
    const trainingConfig = {
        iterations: iterations,
        batchSize: batchSize,
        learningRate: learningRate,
        errorThresh: errorThresh
    };

    for (let i = 0; i < trainingConfig.iterations; i += trainingConfig.batchSize) {
        await new Promise(resolve => setTimeout(resolve, 0));
        net.train(trainingData, {
            iterations: trainingConfig.batchSize,
            learningRate: trainingConfig.learningRate,
            errorThresh: trainingConfig.errorThresh
        });
        updateProgress((i + trainingConfig.batchSize) / trainingConfig.iterations * 100);
    }
    
    const lastSequence = sequences[sequences.length - 1][0];
    const prediction = net.run(lastSequence);
    
    const min = Math.min(...lastSequence);
    const max = Math.max(...lastSequence);
    return prediction * (max - min) + min;
}

document.addEventListener('DOMContentLoaded', () => {
    const predictButton = document.getElementById('predict');
    predictButton.textContent = 'Start';
    const loadingElement = document.getElementById('loading');
    
    const speedAccuracySlider = document.getElementById('speed-accuracy');
    const hiddenNeuronsSlider = document.getElementById('hidden-neurons');
    const iterationsSlider = document.getElementById('iterations');
    const batchSizeSlider = document.getElementById('batch-size');
    const learningRateSlider = document.getElementById('learning-rate');
    const errorThreshSlider = document.getElementById('error-thresh');

    const hiddenNeuronsValue = document.getElementById('hidden-neurons-value');
    const iterationsValue = document.getElementById('iterations-value');
    const batchSizeValue = document.getElementById('batch-size-value');
    const learningRateValue = document.getElementById('learning-rate-value');
    const errorThreshValue = document.getElementById('error-thresh-value');

    function updateSliders() {
        const speedAccuracy = speedAccuracySlider.value / 100;

        hiddenNeuronsSlider.value = Math.round(15 * (1 - speedAccuracy) + 5);
        iterationsSlider.value = Math.round(450 * speedAccuracy + 50);
        batchSizeSlider.value = Math.round(45 * (1 - speedAccuracy) + 5);
        learningRateSlider.value = Math.round(99 * (1 - speedAccuracy) + 1);
        errorThreshSlider.value = Math.round(99 * (1 - speedAccuracy) + 1);

        updateSliderValues();
    }

    function updateSliderValues() {
        hiddenNeuronsValue.textContent = hiddenNeuronsSlider.value;
        iterationsValue.textContent = iterationsSlider.value;
        batchSizeValue.textContent = batchSizeSlider.value;
        learningRateValue.textContent = (learningRateSlider.value / 10000).toFixed(4);
        errorThreshValue.textContent = (errorThreshSlider.value / 1000).toFixed(3);
    }

    speedAccuracySlider.addEventListener('input', updateSliders);
    hiddenNeuronsSlider.addEventListener('input', updateSliderValues);
    iterationsSlider.addEventListener('input', updateSliderValues);
    batchSizeSlider.addEventListener('input', updateSliderValues);
    learningRateSlider.addEventListener('input', updateSliderValues);
    errorThreshSlider.addEventListener('input', updateSliderValues);

    updateSliders();

    if (predictButton) {
        console.log('Кнопка Start найдена');
        predictButton.addEventListener('click', async () => {
            console.log('Кнопка Start нажата');
            loadingElement.style.display = 'block';
            predictButton.disabled = true;

            try {
                // Получаем текущие цены для акций SBER и MGNT
                loadingElement.textContent = 'Получение текущих цен...';
                const prices = await getCurrentPrice('SBER,MGNT');

                if (!prices.SBER && !prices.MGNT) {
                    throw new Error('Не удалось получить цены для обеих акций');
                }

                // Обрабатываем SBER
                if (prices.SBER) {
                    const sberCurrentPrice = prices.SBER.rub;
                    loadingElement.textContent = 'Предсказание цены SBER: 0%';
                    const sberPredictedPrice = await predictPrice(window.sberSequences, progress => {
                        loadingElement.textContent = `Предсказание цены SBER: ${progress.toFixed(0)}%`;
                    });
                    const sberDifference = sberPredictedPrice - sberCurrentPrice;
                    const sberPercentChange = (sberDifference / sberCurrentPrice) * 100;
                    document.getElementById('sber-result').textContent = `SBER: ${formatResult(sberCurrentPrice, sberPredictedPrice, sberDifference, sberPercentChange)}`;
                } else {
                    document.getElementById('sber-result').textContent = 'Ошибка при получении данных SBER';
                }

                // Обрабатываем MGNT
                if (prices.MGNT) {
                    const mgntCurrentPrice = prices.MGNT.rub;
                    loadingElement.textContent = 'Предсказание цены MGNT: 0%';
                    const mgntPredictedPrice = await predictPrice(window.mgntSequences, progress => {
                        loadingElement.textContent = `Предсказание цены MGNT: ${progress.toFixed(0)}%`;
                    });
                    const mgntDifference = mgntPredictedPrice - mgntCurrentPrice;
                    const mgntPercentChange = (mgntDifference / mgntCurrentPrice) * 100;
                    document.getElementById('mgnt-result').textContent = `MGNT: ${formatResult(mgntCurrentPrice, mgntPredictedPrice, mgntDifference, mgntPercentChange)}`;
                } else {
                    document.getElementById('mgnt-result').textContent = 'Ошибка при получении данных MGNT';
                }
            } catch (error) {
                console.error('Ошибка предсказания:', error);
                document.getElementById('sber-result').textContent = 'Ошибка при получении данных';
                document.getElementById('mgnt-result').textContent = 'Ошибка при получении данных';
            } finally {
                loadingElement.style.display = 'none';
                predictButton.disabled = false;
                console.log('Загрузка завершена');
            }
        });
    } else {
        console.error('Кнопка Start не найдена');
    }
});

function formatResult(currentPrice, predictedPrice, difference, percentChange) {
    const signDifference = difference >= 0 ? '+' : '-';
    const signPercentChange = percentChange >= 0 ? '+' : '-';
    return `${currentPrice.toFixed(2)} ₽ ${signDifference} ${Math.abs(difference).toFixed(2)} ₽ = ${predictedPrice.toFixed(2)} ₽ (${signPercentChange}${Math.abs(percentChange).toFixed(2)}%)`;
}