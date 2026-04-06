from flask import Flask, render_template, request, jsonify, send_file
import os
import io
import json
from PyPDF2 import PdfReader, PdfWriter

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200MB limit

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/merge', methods=['POST'])
def merge():
    try:
        files = request.files.getlist('files')
        selections_json = request.form.get('selections', '[]')
        selections = json.loads(selections_json)

        if not files or all(f.filename == '' for f in files):
            return jsonify({'error': 'No files provided'}), 400

        writer = PdfWriter()

        for i, file in enumerate(files):
            reader = PdfReader(file)
            total_pages = len(reader.pages)

            file_sel = next((s for s in selections if s['fileIndex'] == i), None)

            if file_sel and file_sel.get('pages'):
                selected_pages = sorted(file_sel['pages'])
                for page_num in selected_pages:
                    if 1 <= page_num <= total_pages:
                        writer.add_page(reader.pages[page_num - 1])
            else:
                for page in reader.pages:
                    writer.add_page(page)

        if len(writer.pages) == 0:
            return jsonify({'error': 'No pages selected to merge'}), 400

        output = io.BytesIO()
        writer.write(output)
        output.seek(0)

        return send_file(
            output,
            as_attachment=True,
            download_name='merged.pdf',
            mimetype='application/pdf'
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)
