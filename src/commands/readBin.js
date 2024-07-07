import * as fs from 'fs';
import { PNG } from 'pngjs'
const { createCanvas, Image } = require('canvas')
import { parseWatchFaceBin, getAvailableModels } from '../watchFaceBinTools/watchFaceBinParser'
import { generatePreview } from '../watchFaceBinTools/previewGenerator'
import { checkInputGetOutput } from './utils';

async function createImageBitmap (blob) {
    const ab = blob.data
    const img = new Image()
    await new Promise(rs => {
      img.onload = rs
      img.src = new Uint8Array(ab) // might have to do: Buffer.from(ab)
    })
    return img
}

export default function readBin({ input, model }) {
    const models = getAvailableModels()
    const modelDescriptor = models.find(m => m.id == model)

    if (!modelDescriptor) {
        console.error(`Unknown watch model ${model}`)
        return
    }

    const output = checkInputGetOutput(input, "_extracted")

    console.log("Reading " + input)
    const inData = fs.readFileSync(input).buffer

    const { parameters, images } = parseWatchFaceBin(inData, modelDescriptor.fileType)

    fs.mkdirSync(output, { recursive: true })
    fs.writeFileSync(output + "/watchface.json", JSON.stringify(parameters, null, 2))

    images.forEach((image, i) => {
        const png = new PNG({ width: image.width, height: image.height })
        png.data = image.pixels
        const outData = PNG.sync.write(png)
        fs.writeFileSync(output + `/${i}.png`, outData);
    })

    const status = {
        hours: 12,
        minutes: 6,
        seconds: 34,
        steps: 12882,
        stepsPercent: 67,
        calories: 3453,
        caloriesPercent: 20,
        pulse: 123,
        heartPercent: 43,
        distance: 14.6,
        pai: 156,
        year: 2021,
        month: 3,
        day: 23,
        pm: true,
        weekday: 4,
        weather: 5,
        currentTemperature: 26,
        dayTemperature: 43,
        nightTemperature: -10,
        humidity: 98,
        wind: 12,
        uvi: 10,
        doNotDisturb: true,
        lock: false,
        bluetooth: false,
        batteryPercent: 64,
        alarmHours: 6,
        alarmMinutes: 0,
        alarmOnOff: true,
        animationTime: 0,
        locale: {
            lang: "EN",
            imperial: false,
        },
    };

    const canvas = createCanvas(modelDescriptor.screen.width, modelDescriptor.screen.height)
    const ctx = canvas.getContext("2d");

    let imagesWithPositionPromise = [];
    try {
        imagesWithPositionPromise = generatePreview(
            parameters,
            images,
            status,
            modelDescriptor
        ).map((e) => {
            if (e.canvas) {
                return new Promise((resolve) => {
                    resolve({
                        image: e.canvas,
                        position: e.position,
                    });
                });
            }
            const image = images[e.imageId - (modelDescriptor.fileType.imageCountOffset || 0)];
            const imageData = ctx.createImageData(
                image.width,
                image.height
            );
            imageData.data.set(image.pixels);
            return new Promise((resolve) => {
                createImageBitmap(imageData).then((img) => {
                    resolve({
                        image: img,
                        position: e.position,
                    });
                });
            });
        });
    } catch (e) {
        console.error(e);
        errorMessage.set(e);
    }

    Promise.all(imagesWithPositionPromise).then((imagesWithPosition) => {
        // Clip to visible area
        const r = modelDescriptor.screen.roundedBorder;
        const w = canvas.width;
        const h = canvas.height;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.arcTo(w, 0, w, h, r);
        ctx.arcTo(w, h, 0, h, r);
        ctx.arcTo(0, h, 0, 0, r);
        ctx.arcTo(0, 0, w, 0, r);
        ctx.closePath();
        ctx.clip();
        // Fill background with black
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // draw actual images
        imagesWithPosition.forEach((img) => {
            ctx.drawImage(img.image, img.position.x, img.position.y);
        });
    });

    const out = fs.createWriteStream(output + '/preview.png')
    const stream = canvas.createPNGStream()
    stream.pipe(out)
    out.on('finish', () =>  console.log('The PNG file was created.'))

    console.log("Written to " + output)
}